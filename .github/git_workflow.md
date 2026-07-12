# Zero to Hero: Deploying MemTrace-Simulith on Alibaba Cloud

> A beginner-friendly walkthrough of every step, every command, every decision.

**Repository:** `https://github.com/hazeezadebayo/memtrace-simulith`
**Live site:** `http://47.82.157.35:3000`
**GHCR Image:** `ghcr.io/hazeezadebayo/memtrace-simulith:latest`

---

## TL;DR (3-minute summary)

1. We wrote code → pushed to GitHub
2. GitHub Actions builds a Docker image on their 7GB RAM servers (not our puny 1GB box)
3. The image goes to GitHub Container Registry (ghcr.io) — public, no auth needed to pull
4. GitHub Actions SSHes into our Alibaba SAS server and runs it
5. Every `git push` re-deploys automatically

**One command to deploy:**
```bash
git push
```

**Errors we hit and what fixed them** (detailed in Part 8):

| Error | Root cause | Fix |
|---|---|---|
| `ERR_MODULE_NOT_FOUND: config.js` | `.gitignore` excluded `extension/env/config.js`, so `actions/checkout` never fetched it → missing from Docker build | Remove pattern from `.gitignore`; add `RUN cp config.example.js` fallback |
| `ERR_MODULE_NOT_FOUND: manifest.js` | `.gitignore` had bare `data/` matching ANY `data/` dir at any depth — killed `simulith/src/data/manifest.js` etc. | Change `data/` → `/data/` (root-only) + add `memtrace/data/` explicitly |
| `SQLITE_CANTOPEN: /app/data/users.db` | `USER node` runs the container; `/app/data` dir didn't exist in image → volume mounted empty owned by root | Add `RUN mkdir -p /app/data && chown -R node:node /app/data` in Dockerfile |

---

# Part 1: Why We Did It This Way

## The Problem

We have a Node.js app (MemTrace) that simulates AI agents. It needs:

| Resource | What we have | What we can afford |
|---|---|---|
| RAM | 1 GB on Alibaba SAS ($4/mo) | Not enough to compile code |
| CPU | 2 vCPU | Fine for running, bad for building |
| Disk | 30 GB | Tight but workable |

**The contradiction:** Building the Docker image needs ~1.5GB RAM (because `node-llama-cpp` compiles C++ code). Running the app needs only ~400MB. If we build on the SAS server, it crashes mid-build (OOM = Out of Memory).

**The solution:** Build on GitHub Actions (7GB RAM, free), push the finished image to a registry, and only pull+run on the SAS server.

## How to reach the app from both worlds

| Domain | What it is | URL |
|---|---|---|
| **GitHub** (source code) | Repository | `https://github.com/hazeezadebayo/memtrace-simulith` |
| **GitHub Actions** (CI/CD logs) | Workflow runs | `https://github.com/hazeezadebayo/memtrace-simulith/actions` |
| **GHCR** (container image) | Pre-built Docker image | `https://github.com/hazeezadebayo/memtrace-simulith/pkgs/container/memtrace-simulith` |
| **Alibaba SAS** (live server) | Running container API | `http://47.82.157.35:3000` |
| **Health check** | JSON status | `http://47.82.157.35:3000/health` |
| **Workspace dashboard** | GUI landing page | `http://47.82.157.35:3000/simulith/workspace.html` |

> **Note:** Port 3000 must be opened in the Alibaba SAS Console firewall (see Step 3 below).

---

# Part 2: The Repo Structure

```
memtrace-simulith/
├── .github/
│   ├── workflows/deploy.yml    ← The CI/CD pipeline
│   └── git_workflow.md         ← This file
├── memtrace/                   ← The actual app code
│   ├── api/                    ← Express server routes
│   ├── extension/              ← Config, LLM adapters, DB
│   ├── simulith/               ← Simulation engine + dashboard
│   ├── docker/
│   │   ├── Dockerfile          ← Dev Dockerfile (has build tools)
│   │   ├── Dockerfile.prod     ← Prod Dockerfile (slim, no build tools)
│   │   └── docker-compose.yml  ← Dev compose
│   └── package.json
├── memtrace_cicd/
│   ├── memtrace_AB/            ← Alibaba deploy scripts
│   │   └── deploy.sh           ← Manual deployer (fallback)
│   └── memtrace_HF/            ← HuggingFace deploy scripts
│       └── deployer.sh
└── .gitignore
```

---

# Part 3: Setting Up the SAS Server

## Step 1: Create the instance

In Alibaba Cloud Console → Simple Application Server:
- **Image:** Docker v26.1.3 (comes with Docker pre-installed)
- **Plan:** $4/mo (1 GB RAM, 30 GB SSD, 2 vCPU, 200 Mbps)
- **Region:** Singapore (best international peering)
- **Duration:** 6 months ($24 — covered by Qwen's $30 coupon)

**Why Singapore?** Best international internet peering. Hong Kong has routing issues for non-Asia traffic. Japan is further from Qwen's API servers.

## Step 2: Set root password

SAS Console → your instance → **More** → **Reset Password**

SAS instances have **no default password**. You MUST set one before you can SSH in.

## Step 3: Open firewall ports (IMPORTANT — easy to forget)

SAS Console → your instance → Firewall → **Add Rule**:
```
Port: 3000
Protocol: TCP
Source: 0.0.0.0/0
Purpose: MemTrace API
```

Default rules already open 22 (SSH), 80 (HTTP), 443 (HTTPS). We need 3000 because that's where docker-compose maps the app. **Without this rule, the API is unreachable from the internet** even though Docker is serving on the right port.

To verify the firewall is open:
```bash
nc -zv 47.82.157.35 3000
# → Connection to 47.82.157.35 port 3000 [tcp/*] succeeded!
```

## Step 4: SSH in for the first time

```bash
# From your terminal once you set the password:
ssh root@47.82.157.35

# Once logged in, enable password login in SSH:
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl restart sshd
```

**Why enable password auth?** SAS ships with SSH key-only auth. We temporarily need password auth to install our deploy key. After that, we turn password auth off again. Not necessary here since it's a hackathon box.

---

# Part 4: The Deploy SSH Key

## Why a separate SSH key?

There are TWO SSH keys in play:

| Key | Private key location | Public key location | Purpose |
|---|---|---|---|
| **Your personal key** | `~/.ssh/id_ed25519` | GitHub (Settings → SSH keys) | You push code to GitHub |
| **Deploy key** | Stored as GitHub Secret `SAS_SSH_KEY` | `/root/.ssh/authorized_keys` on SAS | GitHub Actions deploys to SAS |

**Why not reuse your personal key?** Because the deploy key is stored as a GitHub Secret, which means GitHub holds the private key. You shouldn't give GitHub your personal private key. Generate a dedicated one that can be revoked independently.

## Generate the deploy key

```bash
# On your LOCAL machine (not the SAS server):
ssh-keygen -t ed25519 -f ~/.ssh/memtrace_deploy -N "" -C "memtrace-gh-actions"
```

## Install the public key on the SAS server

```bash
ssh-copy-id -i ~/.ssh/memtrace_deploy.pub root@47.82.157.35
```

**Test it:**
```bash
ssh -i ~/.ssh/memtrace_deploy root@47.82.157.35 "echo 'It works!'"
```

## Show the private key (for GitHub Secrets)

```bash
cat ~/.ssh/memtrace_deploy
```

Copy the entire output (from `-----BEGIN OPENSSH PRIVATE KEY-----` to `-----END OPENSSH PRIVATE KEY-----`). This goes into GitHub Secrets.

---

# Part 5: GitHub Secrets

Go to: `https://github.com/hazeezadebayo/memtrace-simulith/settings/secrets/actions`

Add these **4 Repository Secrets**:

| Secret | Value | Why |
|---|---|---|
| `SAS_HOST` | `47.82.157.35` | The SAS server's public IP |
| `SAS_USER` | `root` | SSH username |
| `SAS_SSH_KEY` | (paste private key from `cat ~/.ssh/memtrace_deploy`) | GitHub uses this to SSH into SAS |
| `QWEN_API_KEY` | `sk-...` | Qwen DashScope API key for LLM calls |

---

# Part 6: The GitHub Actions Workflow

File: `.github/workflows/deploy.yml`

## What it does (the pipeline)

```yaml
name: Deploy to Alibaba SAS
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write        # Needed to push to GHCR
    steps:
      - uses: actions/checkout@v4
      - name: Patch package.json   # Remove node-llama-cpp (saves 1GB RAM)
      - name: Log in to GHCR       # Uses auto-generated GITHUB_TOKEN
      - name: Build & push image   # → ghcr.io/hazeezadebayo/memtrace-simulith
      - name: Deploy to SAS        # SSH in, pull, run, health check
```

## Step-by-step breakdown

### 1. Checkout repo
```yaml
uses: actions/checkout@v4
```

**Gotcha:** `actions/checkout@v4` respects `.gitignore`. Any file that is gitignored will **not** be present on the runner. This was the root cause of our first two ERR_MODULE_NOT_FOUND crashes (see Part 8).

### 2. Patch package.json
```bash
node -e "
  const p = require('./memtrace/package.json');
  delete p.dependencies['node-llama-cpp'];
  delete p.dependencies['bytenode'];
  delete p.dependencies['javascript-obfuscator'];
  delete p.dependencies['esbuild'];
  ...
"
```

**Why?** `node-llama-cpp` compiles C++ code during `npm install`. This needs ~1GB RAM and build tools. Since we use Qwen's cloud API (not local models), this dependency is dead weight.

### 3. Log in to GitHub Container Registry
```yaml
uses: docker/login-action@v3
with:
  registry: ghcr.io
  username: ${{ github.actor }}
  password: ${{ secrets.GITHUB_TOKEN }}
```

**Why `GITHUB_TOKEN`?** Auto-generated per workflow run with `packages: write` permission. No need to create a separate token.

**Why not Docker Hub?** Docker Hub requires a paid account for private images. GHCR is free and since the repo is public, the image is public too — no auth needed to pull on the SAS server.

### 4. Build and push Docker image
```yaml
uses: docker/build-push-action@v5
with:
  context: ./memtrace
  file: ./memtrace/docker/Dockerfile.prod
  push: true
  tags: |
    ghcr.io/hazeezadebayo/memtrace-simulith:latest
    ghcr.io/hazeezadebayo/memtrace-simulith:${{ github.sha }}
```

### 5. Deploy to Alibaba SAS
```yaml
uses: appleboy/ssh-action@v1.0.3
with:
  host: ${{ secrets.SAS_HOST }}
  username: ${{ secrets.SAS_USER }}
  key: ${{ secrets.SAS_SSH_KEY }}
  script: |
    cat > /opt/memtrace/.env.prod << EOF
    LLM_PROVIDER=qwen
    QWEN_API_KEY=${{ secrets.QWEN_API_KEY }}
    ...
    EOF
    docker compose -f /opt/memtrace/docker-compose.yml pull
    docker compose -f /opt/memtrace/docker-compose.yml down
    docker compose -f /opt/memtrace/docker-compose.yml up -d
    # Health check loop (60s timeout):
    for i in $(seq 1 30); do
      curl -sf http://localhost:3106/health && break
      sleep 2
    done
```

---

# Part 7: The Production Dockerfile (with all fixes applied)

File: `memtrace/docker/Dockerfile.prod`

```dockerfile
FROM node:20-slim
WORKDIR /app

RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --production && \
    npm cache clean --force && \
    rm -rf /root/.npm /tmp/*

COPY . .

# Belt-and-suspenders: if config.js was gitignored at checkout time,
# create it from the example template
RUN test -f extension/env/config.js || \
    cp extension/env/config.example.js extension/env/config.js

# CRITICAL: the node user needs to write /app/data for libsql (SQLite)
# This directory does not exist in git (it's gitignored as runtime data).
# Without this mkdir, Docker's volume mounts as root and the node user
# cannot create the database files → SQLITE_CANTOPEN
RUN mkdir -p /app/data && chown -R node:node /app/data

ENV PORT=3106
EXPOSE 3106

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
  CMD node -e "require('http').get('http://localhost:3106/health', \
    r => { process.exit(r.statusCode === 200 ? 0 : 1) })\
    .on('error', () => process.exit(1))"

USER node
CMD ["node", "api/memtrace_server.js"]
```

Each fix addresses a specific runtime crash (see Part 8).

---

# Part 8: Troubleshooting — Every Error We Hit and How We Fixed It

## Error 1: `ERR_MODULE_NOT_FOUND: config.js`

**Symptom:** Container starts, then immediately crashes:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/extension/env/config.js'
```

**Root cause:** The root `.gitignore` had:
```
# Extension Config
memtrace/extension/env/config.js
```

Since `actions/checkout@v4` respects `.gitignore`, the file was **never fetched** from GitHub onto the runner. When Docker copied the working directory with `COPY . .`, `config.js` was missing. (The file existed on disk locally but was untracked.)

**Fix (2 layers):**

1. **Remove the gitignore pattern** so the file gets checked out:
   ```
   # In .gitignore — comment out or delete the line:
   # memtrace/extension/env/config.js
   ```

2. **Add a Dockerfile fallback** so the image builds even if the file is somehow still missing:
   ```dockerfile
   RUN test -f extension/env/config.js || \
       cp extension/env/config.example.js extension/env/config.js
   ```

## Error 2: `ERR_MODULE_NOT_FOUND: manifest.js`

**Symptom:** Same crash, different file:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/simulith/src/data/manifest.js'
```

**Root cause:** The root `.gitignore` had a bare `data/` on its own line:
```
data/
```

In `.gitignore` syntax, `data/` matches **any directory named `data` at any depth**. So it matched:
- `memtrace/simulith/src/data/manifest.js` ← application data, should NOT be ignored
- `memtrace/simulith/src/data/evidence.js` ← same
- `memtrace/data/` ← runtime DBs, SHOULD be ignored

**Fix:** Change `data/` to `/data/` (only matches at repo root) and explicitly add `memtrace/data/`:
```
/data/
memtrace/data/
```

Also update `.dockerignore` (same issue, same fix):
```
/data/     ← was bare data/
```

## Error 3: `SQLITE_CANTOPEN: /app/data/users.db`

**Symptom:** Container runs long enough for the health check to pass, then libsql crashes:
```
Error: ConnectionFailed("Unable to open connection to local database /app/data/users.db: 14")
```

Error code `14` = SQLITE_CANTOPEN. The database file cannot be created or opened.

**Root cause:** The Dockerfile ends with `USER node` for security. The `node` user writes to `/app/data/` for the SQLite database. However:
1. `/app/data/` did not exist in the image (it's `memtrace/data/`, which is gitignored and dockerignored)
2. Docker named volumes are created as `root:root` on first mount
3. If the image directory doesn't exist, the volume is empty and owned by root
4. The `node` user tries to create `users.db` in a root-owned directory → permission denied → SQLITE_CANTOPEN

**Fix:** Create the directory in the Dockerfile and set ownership before switching to the `node` user:
```dockerfile
RUN mkdir -p /app/data && chown -R node:node /app/data
```

**Why this works:** When Docker initializes a named volume on first mount, it copies the contents of the image's directory into the volume. If `/app/data` exists and is owned by `node:node`, the volume will have the same ownership, and the `node` user inside the container can write to it freely.

## Error 4: JWT secret auto-generated (not an error)

**Observation in logs:**
```
[Auth] New JWT secret autonomously generated and persisted.
```

The app generates a JWT secret on first run and persists it to `/app/data/.jwt_secret`. This is **by design** — the secret is created by the app itself, not injected via config. It persists across restarts because of the named volume mount. No action needed.

## Debugging workflow failures

### Live log access (no GitHub login needed on SAS):

```bash
# Check container status
ssh -i ~/.ssh/memtrace_deploy root@47.82.157.35 \
  "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# View last 50 lines of app logs
ssh -i ~/.ssh/memtrace_deploy root@47.82.157.35 \
  "docker compose -f /opt/memtrace/docker-compose.yml logs --tail=50 api"

# Tail live logs
ssh -i ~/.ssh/memtrace_deploy root@47.82.157.35 \
  "docker compose -f /opt/memtrace/docker-compose.yml logs -f api"
```

### Verify the image on GHCR

```bash
# List all tags pushed to GHCR
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:hazeezadebayo/memtrace-simulith:pull" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ghcr.io/v2/hazeezadebayo/memtrace-simulith/tags/list" | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('tags',[]))"
```

### Check the docker-compose.yml on SAS

```bash
ssh -i ~/.ssh/memtrace_deploy root@47.82.157.35 \
  "cat /opt/memtrace/docker-compose.yml"
```

## Other known issues

| Issue | Fix |
|---|---|
| Push fails: "refusing to allow a PAT to create workflow" | Your GitHub token needs the `workflow` scope. Go to `github.com/settings/tokens` |
| Push fails: "Invalid username or token" | Token expired or repo name changed. Switch to SSH remote: `git remote set-url origin git@github.com:hazeezadebayo/memtrace-simulith.git` |
| Workflow fails at "Build and push" | Missing `permissions: packages: write` in the workflow. Check the top-level `jobs.deploy.permissions` block |
| SAS ran out of disk space | 30 GB fills fast with old Docker images: `docker system prune -a -f` |
| API unreachable from browser | Did you open port 3000 in SAS Console → Firewall? |

---

# Part 9: Key Decisions Explained

## Why use `npm install` instead of `npm ci`?

`npm ci` requires the lockfile to exactly match package.json. Since we patch package.json (removing `node-llama-cpp`), the lockfile is stale. `npm install` is more forgiving — it uses the lockfile as a reference but doesn't require an exact match.

## Why run as `USER node` in the Dockerfile?

Security best practice. Running as root inside the container is dangerous — if someone exploits a vulnerability in Node.js, they get root access. The `node` user has no special permissions.

**But this caused Error 3** (`SQLITE_CANTOPEN`). The fix is `RUN mkdir -p /app/data && chown -R node:node /app/data` before the `USER node` line.

## Why a named volume (`memtrace_data`) instead of a bind mount?

Named volumes persist across container restarts and are managed by Docker. The SQLite database and JWT secret live here. If the container crashes and restarts, the data survives.

## Why Singapore region?

Best international peering. Hong Kong has intermittent packet loss for non-Asia traffic. Japan is further from Qwen's API endpoint.

## Why `data/` in `.gitignore` must be `/data/` (root-only)?

A bare `data/` matches `any/path/to/data/` recursively. This accidentally gitignores app data files like `simulith/src/data/manifest.js`. Adding a leading slash (`/data/`) anchors it to the repo root. Explicitly list non-root data dirs (`memtrace/data/`) if they should still be ignored.

## Why 6-month subscription?

Qwen gave a $30 coupon usable for 6 months at $4/mo = $24. Leaves $6 for Qwen API calls. Hackathon judging ends August 7, 2026 — 6 months covers submission + any post-hackathon demo time.

---

# Quick Reference

## Links

| What | URL |
|---|---|
| **GitHub Repository** | `https://github.com/hazeezadebayo/memtrace-simulith` |
| **GitHub Actions (CI/CD logs)** | `https://github.com/hazeezadebayo/memtrace-simulith/actions` |
| **GHCR (container images)** | `https://github.com/hazeezadebayo/memtrace-simulith/pkgs/container/memtrace-simulith` |
| **Live API (Alibaba SAS)** | `http://47.82.157.35:3000` |
| **Health check endpoint** | `http://47.82.157.35:3000/health` |
| **Workspace dashboard** | `http://47.82.157.35:3000/simulith/workspace.html` |
| **Alibaba SAS Console** | `https://ecs.console.aliyun.com/simple` |
| **Qwen API Keys** | `https://home.qwencloud.com/api-keys` |

## Commands

| Action | Command |
|---|---|
| Deploy | `git push` |
| Check deploy status | Open `https://github.com/hazeezadebayo/memtrace-simulith/actions` |
| SSH into SAS | `ssh -i ~/.ssh/memtrace_deploy root@47.82.157.35` |
| View app logs (live) | `ssh root@47.82.157.35 "docker compose -f /opt/memtrace/docker-compose.yml logs -f api"` |
| View last 50 log lines | `ssh root@47.82.157.35 "docker compose -f /opt/memtrace/docker-compose.yml logs --tail=50 api"` |
| Restart manually | `ssh root@47.82.157.35 "docker compose -f /opt/memtrace/docker-compose.yml up -d --force-recreate"` |
| Health check (ext) | `curl http://47.82.157.35:3000/health` |
| Health check (int) | `ssh root@47.82.157.35 "curl -s http://localhost:3106/health"` |
| Prune old images | `ssh root@47.82.157.35 "docker system prune -a -f"` |
| Check container status | `ssh root@47.82.157.35 "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"` |
| List GHCR tags | `TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:hazeezadebayo/memtrace-simulith:pull" \| python3 -c "import sys,json; print(json.load(sys.stdin)['token'])") && curl -s -H "Authorization: Bearer $TOKEN" "https://ghcr.io/v2/hazeezadebayo/memtrace-simulith/tags/list" \| python3 -c "import sys,json; print(json.load(sys.stdin).get('tags',[]))"` |

---

# Part 10: Final Verification (What a Successful Deploy Looks Like)

Once the pipeline completes and the container is healthy, these commands prove everything works:

## Health check
```bash
curl -s http://47.82.157.35:3000/health
```
**Expected output:**
```json
{"status":"ok","db":"offline"}
```

## Dashboard (login page)
```bash
curl -s -L http://47.82.157.35:3000/simulith/workspace.html | head -5
```
**Expected output:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ...
    <title>Login | Simulith</title>
```

## Cheat Sheet — All Domains at a Glance

| Domain | Where | URL |
|---|---|---|
| **Alibaba SAS** (live app) | Running container | `http://47.82.157.35:3000` |
| **Alibaba SAS** (health check) | JSON status | `http://47.82.157.35:3000/health` |
| **Alibaba SAS** (dashboard) | Login → workspace | `http://47.82.157.35:3000/simulith/workspace.html` |
| **GitHub** (source code) | Git repo | `https://github.com/hazeezadebayo/memtrace-simulith` |
| **GHCR** (container image) | Pre-built Docker image | `https://github.com/hazeezadebayo/memtrace-simulith/pkgs/container/memtrace-simulith` |
| **GitHub Actions** (CI/CD pipeline) | Deploy logs | `https://github.com/hazeezadebayo/memtrace-simulith/actions` |

## One Command to Deploy

```bash
git push
```

That's it. GitHub builds on 7GB runners, pushes to GHCR, SSHes into SAS, pulls and restarts. All 3 runtime errors (config.js, manifest.js, users.db permissions) are documented with fixes above. Zero to hero.
