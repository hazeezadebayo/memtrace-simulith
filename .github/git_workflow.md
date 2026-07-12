# Zero to Hero: Deploying MemTrace-Simulith on Alibaba Cloud

> A beginner-friendly walkthrough of every step, every command, every decision.

**Repository:** `https://github.com/hazeezadebayo/memtrace-simulith`
**Live site:** `http://47.82.157.35:3000`

---

## TL;DR (3-minute summary)

1. We wrote code → pushed to GitHub
2. GitHub Actions builds a Docker image on their 7GB RAM servers (not our puny 1GB box)
3. The image goes to GitHub Container Registry (ghcr.io)
4. GitHub Actions SSHes into our Alibaba SAS server and runs it
5. Every `git push` re-deploys automatically

**One command to deploy:**
```bash
git push
```

That's it. Everything below is how we got there, why, and what to do if something breaks.

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

**Why `memtrace/` is nested?** Because the project was originally structured that way. The Docker build context is `memtrace/` — that's where the `package.json` lives.

**Why `memtrace_cicd/memtrace_AB/` is so deeply nested?** Because we made `memtrace_cicd` the umbrella folder for all CI/CD. `_AB` = Alibaba, `_HF` = HuggingFace. More professional than three loose folders at the root.

---

# Part 3: Setting Up the SAS Server

## Step 1: Create the instance

In Alibaba Cloud Console → Simple Application Server:
- **Image:** Docker v26.1.3 (comes with Docker pre-installed)
- **Plan:** $4/mo (1 GB RAM, 30 GB SSD, 2 vCPU, 200 Mbps)
- **Region:** Singapore (best international peering)
- **Duration:** 6 months ($24 — covered by Qwen's $30 coupon)

**Why Singapore?** Best international internet peering. Hong Kong has routing issues for non-Asia traffic. Japan is further from Qwen's API servers.

**Why SAS and not ECS?** SAS bundles compute + storage + networking into one fixed price. No surprise bills. ECS is more flexible but charges separately for everything. For a hackathon, SAS is perfect.

## Step 2: Set root password

SAS Console → your instance → **More** → **Reset Password**

SAS instances have **no default password**. You MUST set one before you can SSH in.

## Step 3: Open firewall ports

SAS Console → your instance → Firewall → **Add Rule**:
```
Port: 3000
Protocol: TCP
Source: 0.0.0.0/0
Purpose: MemTrace API
```

Default rules already open 22 (SSH), 80 (HTTP), 443 (HTTPS). We need 3000 because that's where docker-compose maps the app.

## Step 4: SSH in and enable password auth (first time only)

```bash
# From the SAS Console → Connect → Workbench (opens a browser terminal)
# OR from your terminal once you set the password:
ssh root@47.82.157.35

# Once logged in, enable password login in SSH:
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl restart sshd

# Now SSH from your terminal works with a password
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

**What this does:**
- `-t ed25519` — creates an Ed25519 key (modern, fast, secure)
- `-f ~/.ssh/memtrace_deploy` — saves it with this filename
- `-N ""` — no passphrase (required for automation — GitHub can't type a password)
- `-C "memtrace-gh-actions"` — a comment so you remember what it's for

## Install the public key on the SAS server

```bash
ssh-copy-id -i ~/.ssh/memtrace_deploy.pub root@47.82.157.35
```

**What this does:** Copies your public key to `/root/.ssh/authorized_keys` on the server. Now anyone holding the private key can SSH in without a password.

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

## What are Secrets?

GitHub Secrets are encrypted key-value pairs. Only GitHub Actions workflows can read them. Humans cannot see them once saved.

Go to: `https://github.com/hazeezadebayo/memtrace-simulith/settings/secrets/actions`

Add these **4 Repository Secrets**:

| Secret | Value | Why |
|---|---|---|
| `SAS_HOST` | `47.82.157.35` | The SAS server's public IP |
| `SAS_USER` | `root` | SSH username |
| `SAS_SSH_KEY` | (paste private key from `cat ~/.ssh/memtrace_deploy`) | GitHub uses this to SSH into SAS |
| `QWEN_API_KEY` | `sk-...` | Qwen DashScope API key for LLM calls |

**Why Repository Secrets and not Environment Secrets or Variables?**

- **Repository secrets** are available to all workflows in the repo. Simple.
- **Environment secrets** are scoped to a deployment environment (staging/prod). Overkill for a single server.
- **Variables** are plaintext (unencrypted). Bad for SSH keys and API tokens.

---

# Part 6: The GitHub Actions Workflow

File: `.github/workflows/deploy.yml`

## What it does (the pipeline)

```yaml
name: Deploy to Alibaba SAS
on:
  push:
    branches: [main]   # Triggers on every push to main
  workflow_dispatch:    # Can also be triggered manually from GitHub UI

jobs:
  deploy:
    runs-on: ubuntu-latest   # GitHub's 7GB RAM runner (free)
    permissions:
      contents: read
      packages: write        # Needed to push to GHCR
    steps:
      - name: Checkout repo
      - name: Patch package.json          # Remove node-llama-cpp (save 1GB RAM)
      - name: Log in to GHCR              # Use GITHUB_TOKEN (auto-generated)
      - name: Build and push Docker image # → ghcr.io/hazeezadebayo/memtrace-simulith
      - name: Deploy to Alibaba SAS       # SSH in, pull, run, health check
```

## Step-by-step breakdown

### 1. Checkout repo
```yaml
uses: actions/checkout@v4
```
Downloads your code onto the GitHub runner.

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

**Why?** `node-llama-cpp` compiles C++ code during `npm install`. This needs ~1GB RAM and build tools (g++, cmake, make). Since we use Qwen's cloud API (not local models), this dependency is dead weight. Removing it:
- Saves 1GB of RAM during build
- Removes the need for build tools (smaller final image)
- Makes the Dockerfile 4 lines instead of 10

### 3. Log in to GitHub Container Registry
```yaml
uses: docker/login-action@v3
with:
  registry: ghcr.io
  username: ${{ github.actor }}
  password: ${{ secrets.GITHUB_TOKEN }}
```

**Why `GITHUB_TOKEN`?** Every workflow run gets a temporary token auto-generated. It has `packages: write` permission (set above), so it can push images to GHCR. No need to create a separate token.

**Why not Docker Hub?** Docker Hub requires a paid account for private images. GHCR is free and integrates with GitHub. Since the repo is public, the image is public too — no auth needed to pull.

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

**Why `Dockerfile.prod` and not `Dockerfile`?** The dev Dockerfile installs build tools (python3, make, g++, cmake) for compiling native modules. The prod Dockerfile is only 15 lines:
```dockerfile
FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --production && npm cache clean --force
COPY . .
ENV PORT=3106
EXPOSE 3106
HEALTHCHECK ... CMD node -e "require('http').get(...)"
USER node
CMD ["node", "api/memtrace_server.js"]
```

No build tools → smaller image (~400MB vs ~800MB). No Python, g++, cmake bloat.

### 5. Deploy to Alibaba SAS
```yaml
uses: appleboy/ssh-action@v1.0.3
with:
  host: ${{ secrets.SAS_HOST }}
  username: ${{ secrets.SAS_USER }}
  key: ${{ secrets.SAS_SSH_KEY }}
  script: |
    # On the SAS server:
    1. Write .env.prod with all config (LLM_PROVIDER, API_KEY, etc.)
    2. Write docker-compose.yml
    3. docker compose pull          # Get latest image from GHCR
    4. docker compose down          # Stop old container
    5. docker compose up -d         # Start new one
    6. Health check: curl /health   # Verify it works
```

**Why `appleboy/ssh-action`?** It's the most popular SSH action on the GitHub Marketplace. Handles key auth, strict host checking, and script execution. We don't need to install SSH on the runner — it's all handled by the action.

**Why write `.env.prod` inline?** Secrets should never be in the repo. `.env.prod` is created at deploy time with values from GitHub Secrets. It only exists on the SAS server, never in git.

---

# Part 7: The Remaining Steps (What Happens on Push)

When you run `git push`:

## 1. Build Docker on GitHub runners
```
[1/6] GitHub checks out your code
[2/6] Patches package.json (removes llama.cpp)
[3/6] Builds Docker image using Dockerfile.prod
      → npm install --production (only runtime deps)
      → ~2 minutes, ~400MB image
```

**TL;DR:** `git push` → GitHub builds a Docker image.

**Manual alternative:**
```bash
# If you wanted to build locally (not recommended — slow):
cd memtrace && docker build -f docker/Dockerfile.prod -t memtrace:latest .
```

## 2. Push image to GHCR
```
[4/6] Tags image: ghcr.io/hazeezadebayo/memtrace-simulith:latest
[4/6] Tags image: ghcr.io/hazeezadebayo/memtrace-simulith:<commit-sha>
[4/6] Pushes both tags to GitHub Container Registry
      → ~30 seconds
```

**TL;DR:** The image goes to ghcr.io (GitHub's free container registry).

**View it:** `https://github.com/hazeezadebayo/memtrace-simulith/pkgs/container/memtrace-simulith`

## 3. SSH into SAS, pull image, start container
```
[5/6] SSHes into root@47.82.157.35
[5/6] docker compose pull          # Downloads ghcr.io image
[5/6] docker compose down          # Stops old container
[5/6] docker compose up -d         # Starts new one with 700MB RAM limit
```

**TL;DR:** SAS pulls the new image and restarts.

**Why 700MB mem_limit?** SAS has 1GB total. The OS needs ~200MB, Docker uses ~100MB. The app needs ~400MB during simulation. 700MB is the safety limit — if the app leaks memory, Docker kills it before the whole server crashes.

**Manual alternative if SSHing in directly:**
```bash
ssh root@47.82.157.35
cd /opt/memtrace
docker compose pull
docker compose down --remove-orphans
docker compose up -d
```

## 4. Health check → verify
```
[6/6] Every 2 seconds for 60 seconds:
      curl http://localhost:3106/health
      → Expect: {"status":"ok"}
```

**TL;DR:** Waits up to 60s for the app to start, then confirms it's alive.

**Manual check:**
```bash
curl http://47.82.157.35:3000/health
# → {"status":"ok","db":"offline"}
```

**Dashboard:**
```bash
http://47.82.157.35:3000/simulith/workspace.html
```

---

# Part 8: Troubleshooting

## Push fails: "refusing to allow a Personal Access Token..."

```
! [remote rejected] main -> main (refusing to allow a Personal Access Token
  to create or update workflow `.github/workflows/deploy.yml` without
  `workflow` scope)
```

**Fix:** Your GitHub token needs the `workflow` scope. Go to `github.com/settings/tokens` → find token → check `workflow` → save.

## Push fails: "Invalid username or token"

Your token is expired or the repo name changed. Update the token or use SSH:
```bash
git remote set-url origin git@github.com:hazeezadebayo/memtrace-simulith.git
```

## Workflow fails at "Build and push" step

Check the workflow logs at `https://github.com/hazeezadebayo/memtrace-simulith/actions`. Most common issue: the `permissions: packages: write` block is missing.

## Container won't start (health check fails)

```bash
ssh root@47.82.157.35
cd /opt/memtrace
docker compose logs api --tail=50
```

Common issues:
- API_KEY is wrong in `.env.prod`
- Port 3106 is already in use
- Out of memory (check `docker stats`)

## SAS ran out of disk space

30 GB fills up fast with old Docker images:
```bash
ssh root@47.82.157.35
docker system prune -a -f   # Removes ALL unused images
```

---

# Part 9: Key Decisions Explained

## Why use `npm install` instead of `npm ci`?

`npm ci` requires the lockfile to exactly match package.json. Since we patch package.json (removing `node-llama-cpp`), the lockfile is stale. `npm install` is more forgiving — it uses the lockfile as a reference but doesn't require an exact match.

## Why run as `USER node` in the Dockerfile?

Security best practice. Running as root inside the container is dangerous — if someone exploits a vulnerability in Node.js, they get root access. The `node` user has no special permissions.

## Why a named volume (`memtrace_data`) instead of a bind mount?

Named volumes persist across container restarts and are managed by Docker. The SQLite database and JWT secret live here. If the container crashes and restarts, the data survives.

## Why Singapore region?

Best international peering. Hong Kong has intermittent packet loss for non-Asia traffic. Japan is further from Qwen's API endpoint (Singapore also has lower latency).

## Why 6-month subscription?

Qwen gave a $30 coupon usable for 6 months at $4/mo = $24. Leaves $6 for Qwen API calls. Hackathon judging ends August 7, 2026 — 6 months covers submission + any post-hackathon demo time.

## Why `memtrace_cicd/memtrace_AB/` and `memtrace_cicd/memtrace_HF/`?

Keeps the project root clean. Instead of three loose folders (`memtrace_cicd`, `memtrace_hackathon_cicd`, `.github`), CI/CD tools are grouped under the `memtrace_cicd` umbrella. `_AB` = Alibaba, `_HF` = HuggingFace. Self-documenting.

---

# Quick Reference

| Action | Command |
|---|---|
| Deploy | `git push` |
| Check deploy status | `https://github.com/hazeezadebayo/memtrace-simulith/actions` |
| View live site | `http://47.82.157.35:3000` |
| SSH into SAS | `ssh root@47.82.157.35` |
| View app logs | `ssh root@47.82.157.35 "docker compose -f /opt/memtrace/docker-compose.yml logs -f api"` |
| Restart manually | `ssh root@47.82.157.35 "cd /opt/memtrace && docker compose up -d"` |
| Prune old images | `ssh root@47.82.157.35 "docker system prune -a -f"` |
| Health check | `curl http://47.82.157.35:3000/health` |
| Dashboard | `http://47.82.157.35:3000/simulith/workspace.html` |
| GHCR packages | `https://github.com/hazeezadebayo/memtrace-simulith/pkgs/container/memtrace-simulith` |
| GitHub repo | `https://github.com/hazeezadebayo/memtrace-simulith` |
| Alibaba Console | [SAS Dashboard](https://ecs.console.aliyun.com/simple) |
| Qwen API Keys | `https://home.qwencloud.com/api-keys` |
