#!/usr/bin/env bash
# =============================================================================
# MEMTRACE ALIBABA SAS PRODUCTION DEPLOYER v1
# =============================================================================
# Usage:
#   ./deploy.sh                                  # interactive (prompts for IP/key)
#   ./deploy.sh --server 47.82.157.35            # with server IP
#   ./deploy.sh --server 47.82.157.35 --key ~/.ssh/alibaba.pem
#   ./deploy.sh --server 47.82.157.35 --no-build  # skip Docker build
#   ./deploy.sh --help
#
# What it does:
#   1. Stages a clean copy of memtrace/ — strips noise, secrets, models, tests
#   2. Removes node-llama-cpp from deps (prevents OOM on 1 GB RAM during build)
#   3. Generates .env.prod template and production docker-compose.yml
#   4. Archives → SCPs to the SAS instance
#   5. SSH: extracts, builds, runs, and health-check verifies
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MEMTRACE_DIR="$PROJECT_ROOT/memtrace"

# ── Defaults ────────────────────────────────────────────────────────────────
SSH_USER="root"
SSH_KEY=""
SERVER_IP=""
HOST_PORT="3000"
DEPLOY_TAG="prod-$(date +%Y%m%d-%H%M%S)"
SKIP_BUILD=false
CLEAN_ONLY=false

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*" >&2; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
header(){ echo -e "\n${BOLD}════════════════════════════════════════════════════════════${NC}"; echo -e "${BOLD}  $*${NC}"; echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"; }

# ── CLI Parsing ─────────────────────────────────────────────────────────────
usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Deploy MemTrace to an Alibaba Cloud SAS instance.

Options:
  --server IP        SAS instance public IP (default: prompt)
  --user USER        SSH user (default: root)
  --key PATH         SSH private key path (default: password prompt)
  --port PORT        Host port to expose (default: 3000)
  --tag TAG          Docker image tag (default: prod-<timestamp>)
  --no-build         Skip Docker build, only upload source
  --clean            Only remove existing deployment, don't deploy
  --help             Show this help
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --server)  SERVER_IP="$2";   shift 2 ;;
        --user)    SSH_USER="$2";    shift 2 ;;
        --key)     SSH_KEY="$2";     shift 2 ;;
        --port)    HOST_PORT="$2";   shift 2 ;;
        --tag)     DEPLOY_TAG="$2";  shift 2 ;;
        --no-build) SKIP_BUILD=true; shift ;;
        --clean)   CLEAN_ONLY=true;  shift ;;
        --help|-h) usage ;;
        *) err "Unknown option: $1. Use --help for usage." ;;
    esac
done

# ── Phase 0: Validate & Prompt ─────────────────────────────────────────────
header "PHASE 0: Pre-flight Checks"

for cmd in ssh scp tar; do
    command -v "$cmd" &>/dev/null || err "'$cmd' not found. Install it first."
done

[[ -d "$MEMTRACE_DIR" ]] || err "memtrace/ not found at $MEMTRACE_DIR. Are you in the right repo?"

if [[ -z "$SERVER_IP" ]]; then
    read -r -p "Enter SAS public IP: " SERVER_IP
fi
[[ -z "$SERVER_IP" ]] && err "Server IP is required."
info "Target server: $SERVER_IP"

SSH_CMD="ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
SCP_CMD="scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
if [[ -n "$SSH_KEY" ]]; then
    [[ -f "$SSH_KEY" ]] || err "SSH key not found: $SSH_KEY"
    SSH_CMD="$SSH_CMD -i $SSH_KEY"
    SCP_CMD="$SCP_CMD -i $SSH_KEY"
    info "Using SSH key: $SSH_KEY"
fi

if ! $SSH_CMD "${SSH_USER}@${SERVER_IP}" "echo connected" &>/dev/null; then
    warn "Cannot connect to $SERVER_IP as $SSH_USER. Check:"
    warn "  1. Have you reset the root password in SAS Console?"
    warn "  2. Is port 22 open in the SAS Firewall?"
    warn "  3. Are you on the right IP?"
    err "SSH connection failed."
fi
ok "SSH connection to ${SSH_USER}@${SERVER_IP} — OK"

# ── Phase 0.5: Clean only mode ─────────────────────────────────────────────
if $CLEAN_ONLY; then
    header "PHASE 0.5: Cleaning remote deployment"
    $SSH_CMD "${SSH_USER}@${SERVER_IP}" bash -s <<'REMOTE'
        set -e
        echo "[Remote] Stopping MemTrace containers..."
        cd /opt/memtrace 2>/dev/null && docker compose down --remove-orphans 2>/dev/null || true
        echo "[Remote] Removing MemTrace deployment..."
        rm -rf /opt/memtrace
        echo "[Remote] Pruning unused Docker resources..."
        docker system prune -f --volumes 2>/dev/null || true
REMOTE
    ok "Remote deployment cleaned."
    exit 0
fi

# ── Phase 1: Stage Clean Source ─────────────────────────────────────────────
header "PHASE 1: Staging Clean Source"

STAGING_DIR="/tmp/memtrace_deploy_$$"
DEPLOY_DIR="$STAGING_DIR/memtrace"
mkdir -p "$DEPLOY_DIR"
info "Staging directory: $STAGING_DIR"

# ── Selective file copy (only what's needed for production) ─────────────────
info "Copying production files..."

for dir in api extension simulith; do
    cp -r "$MEMTRACE_DIR/$dir" "$DEPLOY_DIR/"
done
for file in package.json package-lock.json .dockerignore; do
    [[ -f "$MEMTRACE_DIR/$file" ]] && cp "$MEMTRACE_DIR/$file" "$DEPLOY_DIR/"
done

# ── Strip everything that must NEVER go to production ───────────────────────
header "PHASE 2: Stripping Non-Essentials"

clean() { rm -rf "$DEPLOY_DIR/$1" && info "  stripped: $1"; }

# Version control
rm -rf "$DEPLOY_DIR/.git" "$DEPLOY_DIR/.gitignore" 2>/dev/null

# Tests & scratch
rm -rf "$DEPLOY_DIR/test" "$DEPLOY_DIR/scratch" "$DEPLOY_DIR/__tests__" 2>/dev/null

# Large model binaries (NOT needed — using Qwen cloud API)
rm -rf "$DEPLOY_DIR/models" 2>/dev/null

# Runtime data (generated on boot, persisted via volume)
rm -rf "$DEPLOY_DIR/data" 2>/dev/null

# Internal documentation
rm -rf "$DEPLOY_DIR/md" 2>/dev/null

# CI/CD infrastructure (not part of the runtime image)
rm -rf "$DEPLOY_DIR/memtrace_cicd" 2>/dev/null

# Any stray .env files (secrets must never ship)
find "$DEPLOY_DIR" -name '.env' -delete
find "$DEPLOY_DIR" -name '.env.*' -delete

# Source maps & type declarations (expose internals)
find "$DEPLOY_DIR" -name '*.js.map' -delete
find "$DEPLOY_DIR" -name '*.d.ts' -delete
find "$DEPLOY_DIR" -name '*.tsbuildinfo' -delete

# Runtime state files
find "$DEPLOY_DIR" -name 'state.json' -delete
find "$DEPLOY_DIR" -name '*.log' -delete
find "$DEPLOY_DIR" -name '.jwt_secret' -delete

ok "Staging clean — $(du -sh "$DEPLOY_DIR" | cut -f1)"

# ── Phase 3: Patch package.json (remove node-llama-cpp, remove bytenode) ────
header "PHASE 3: Patching Dependencies for Low-Memory Build"

if [[ -f "$DEPLOY_DIR/package.json" ]]; then
    # Remove node-llama-cpp — compiles C++ native addon, needs ~1GB+ RAM,
    # OOMs on 1 GB SAS instances. We use Qwen cloud API, so it's dead weight.
    node -e "
        const p = require('$DEPLOY_DIR/package.json');
        delete p.devDependencies;
        delete p.scripts.test;
        delete p.scripts.prepare;
        delete p.jest;
        if (p.dependencies) {
            delete p.dependencies['node-llama-cpp'];
            delete p.dependencies['bytenode'];
            delete p.dependencies['javascript-obfuscator'];
            delete p.dependencies['esbuild'];
        }
        p.scripts = { start: p.scripts.start || 'node api/memtrace_server.js' };
        require('fs').writeFileSync('$DEPLOY_DIR/package.json', JSON.stringify(p, null, 2));
    "
    info "Removed node-llama-cpp, bytenode, obfuscator, esbuild from dependencies (save ~1GB build RAM)"
    info "Removed devDependencies and test scripts"

    # Pin package-lock.json presence for reproducible npm ci
    [[ -f "$DEPLOY_DIR/package-lock.json" ]] || cp "$MEMTRACE_DIR/package-lock.json" "$DEPLOY_DIR/package-lock.json" 2>/dev/null || true
fi

# ── Phase 4: Generate Production Dockerfile ────────────────────────────────
header "PHASE 4: Generating Production Dockerfile"

cat > "$DEPLOY_DIR/Dockerfile" << 'DOCKERFILE'
FROM node:20-slim
WORKDIR /app

# Only curl needed for healthcheck — no build tools (node-llama-cpp removed)
RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

# Use npm install (not ci — package.json is patched, lockfile may diverge)
COPY package*.json ./
RUN npm install --production && \
    npm cache clean --force && \
    rm -rf /root/.npm /tmp/*

# Copy application code
COPY . .

ENV PORT=3106
EXPOSE 3106

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
  CMD node -e "require('http').get('http://localhost:3106/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

USER node
CMD ["node", "api/memtrace_server.js"]
DOCKERFILE

ok "Production Dockerfile generated (multi-stage, no build deps)"

# ── Phase 5: Generate Production docker-compose.yml ─────────────────────────
header "PHASE 5: Generating Production docker-compose.yml"

cat > "$DEPLOY_DIR/docker-compose.yml" << COMPOSE
services:
  api:
    image: memtrace:${DEPLOY_TAG}
    container_name: memtrace_api
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "${HOST_PORT}:3106"
    env_file:
      - .env.prod
    volumes:
      - memtrace_data:/app/data
    restart: unless-stopped
    stop_grace_period: 30s
    mem_limit: 700m
    mem_reservation: 400m
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3106/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  memtrace_data:
    driver: local
COMPOSE

ok "Production docker-compose.yml generated (700m mem_limit, healthcheck, data volume)"

# ── Phase 6: Generate .env.prod Template ────────────────────────────────────
header "PHASE 6: Generating .env.prod Template"

cat > "$DEPLOY_DIR/.env.prod" << 'ENV'
# =============================================================================
# MemTrace Production Environment — SAS Deployment
# =============================================================================
# Fill in your values. This file is read by docker-compose and injected
# into the container. NEVER commit this file to version control.
#
# For Qwen Cloud: get your API key at https://home.qwencloud.com/api-keys
# Use your Token Plan key (sk-sp-...) if you have a Token Plan, or
# standard pay-as-you-go key (sk-...) if using pay-as-you-go.
# =============================================================================

# ── LLM Provider: Qwen Cloud (free credits for hackathon) ──────────────────
LLM_PROVIDER=qwen
LLM_MODEL=qwen-turbo

# ── Embedding Provider: Qwen Cloud ──────────────────────────────────────────
EMB_PROVIDER=qwen

# ── Qwen API Key (REQUIRED — replace with your key) ─────────────────────────
API_KEY=sk-your-qwen-api-key-here

# ── Server ──────────────────────────────────────────────────────────────────
PORT=3106
NODE_ENV=production

# ── Database: Local SQLite (offline mode, no cloud DB needed) ──────────────
DB_TYPE=offline
DB_PATH=data/memtrace.sqlite

# ── Optional: Google OAuth for UI Login ────────────────────────────────────
# Leave empty to skip Google login (API tokens still work via Bearer auth).
# GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# ── Simulation Limits (Safe defaults for 1 GB RAM) ─────────────────────────
LIMIT_MESH_MAX_AGENTS=15
LIMIT_MESH_MIN_AGENTS=4
LIMIT_MESH_MAX_TICKS=8
MT_AGENT_COUNT=10
MT_MAX_ROUNDS=2
LLM_RPM=30
LLM_MAX_CONCURRENT=2
ENV

ok ".env.prod template created (fill in your API_KEY before deploy)"

# ── Phase 7: Archive ────────────────────────────────────────────────────────
header "PHASE 7: Packaging Deployment Archive"

ARCHIVE="/tmp/memtrace_deploy_${DEPLOY_TAG}.tar.gz"
tar -czf "$ARCHIVE" -C "$STAGING_DIR" memtrace/
ok "Archive: $(du -h "$ARCHIVE" | cut -f1) — $ARCHIVE"

# ── Phase 8: Upload to SAS Instance ─────────────────────────────────────────
header "PHASE 8: Uploading to SAS Instance"

REMOTE_DIR="/opt/memtrace"
$SSH_CMD "${SSH_USER}@${SERVER_IP}" "mkdir -p $REMOTE_DIR"
$SCP_CMD "$ARCHIVE" "${SSH_USER}@${SERVER_IP}:$REMOTE_DIR/archive.tar.gz"
ok "Archive uploaded to $SERVER_IP:$REMOTE_DIR/archive.tar.gz"

# ── Phase 9: Remote Deploy ──────────────────────────────────────────────────
header "PHASE 9: Remote Deploy"

if $SKIP_BUILD; then
    info "--no-build set. Skipping Docker build and deploy."
    info "Uploaded source is at $REMOTE_DIR on $SERVER_IP."
    info "SSH in and run: cd $REMOTE_DIR && tar xzf archive.tar.gz && docker compose up -d"
else
    info "Building and deploying remotely via SSH..."

    $SSH_CMD "${SSH_USER}@${SERVER_IP}" bash -s -- "$REMOTE_DIR" "$DEPLOY_TAG" <<'REMOTE'
        set -e
        REMOTE_DIR="$1"
        DEPLOY_TAG="$2"

        echo "[Remote] Extracting deployment archive..."
        cd "$REMOTE_DIR"
        tar xzf archive.tar.gz
        rm -f archive.tar.gz

        # Move contents up so docker-compose.yml is at root
        if [[ -d memtrace ]]; then
            shopt -s dotglob
            mv memtrace/* . 2>/dev/null || true
            rm -rf memtrace
        fi

        echo "[Remote] Stopping previous deployment..."
        docker compose down --remove-orphans 2>/dev/null || true

        echo "[Remote] Building Docker image (DEPLOY_TAG=${DEPLOY_TAG})..."
        docker compose build --pull --no-cache 2>&1

        echo "[Remote] Starting MemTrace..."
        docker compose up -d 2>&1

        echo "[Remote] Waiting for health check..."
        RETRIES=0
        MAX_RETRIES=30
        until curl -s http://localhost:3106/health > /dev/null 2>&1 || [ $RETRIES -eq $MAX_RETRIES ]; do
            sleep 2
            RETRIES=$((RETRIES + 1))
        done

        if curl -s http://localhost:3106/health 2>/dev/null | grep -q '"ok"'; then
            echo "[Remote] ✅ Health check passed — API is up."
        else
            echo "[Remote] ❌ Health check failed. Check logs: docker compose logs api"
            docker compose logs --tail=50 api
            exit 1
        fi

        echo "[Remote] Cleanup: pruning old images..."
        docker image prune -f 2>/dev/null || true
REMOTE

    ok "Deployment complete!"
fi

# ── Phase 10: Cleanup Local Staging ─────────────────────────────────────────
header "PHASE 10: Local Cleanup"

rm -rf "$STAGING_DIR"
# Keep the archive for rollback
info "Local staging cleaned."
info "Archive kept at: $ARCHIVE"

# ── Summary ─────────────────────────────────────────────────────────────────
header "DEPLOYMENT SUMMARY"
echo -e "  ${BOLD}Server:${NC}      $SERVER_IP"
echo -e "  ${BOLD}Port:${NC}        ${HOST_PORT}"
echo -e "  ${BOLD}URL:${NC}         http://${SERVER_IP}:${HOST_PORT}"
echo -e "  ${BOLD}Dashboard:${NC}   http://${SERVER_IP}:${HOST_PORT}/simulith/workspace.html"
echo -e "  ${BOLD}Health:${NC}       http://${SERVER_IP}:${HOST_PORT}/health"
echo -e "  ${BOLD}Tag:${NC}         ${DEPLOY_TAG}"
echo -e "  ${BOLD}Archive:${NC}     $ARCHIVE"
echo ""
echo -e "  ${YELLOW}IMPORTANT:${NC} If you haven't already:"
echo -e "  1. Open port ${HOST_PORT} in SAS Console → Firewall → Add Rule"
echo -e "  2. Fill in your Qwen API key in .env.prod on the server:"
echo -e "     ${CYAN}ssh root@${SERVER_IP} 'vim /opt/memtrace/.env.prod'${NC}"
echo -e "  3. Restart to apply: ${CYAN}ssh root@${SERVER_IP} 'cd /opt/memtrace && docker compose up -d'${NC}"
