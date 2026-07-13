# MemTrace — Multi-Agent Simulation Platform

MemTrace is a simulation engine that spawns autonomous agents with distinct personas, runs them through social interaction rounds, and measures belief drift, faction formation, and decision confidence. Agents publish posts, react to shocks, form edges, and defect between factions across simulated platforms.

Deployed at: `https://simulith.hazeezadebayo.dev`

---

## Architecture

```
memtrace/
├── api/                    # Express API server & routes
│   ├── memtrace_server.js  # Entry point
│   ├── auth_server.js      # Google OAuth + JWT auth
│   ├── core_memory_server.js
│   ├── council_server.js
│   ├── memtrace_mode_server.js
│   ├── mesh_server.js
│   ├── tree_server.js
│   ├── simulith_server.js
│   ├── telemetry_server.js
│   ├── persona_server.js
│   ├── automation_router.js
│   └── db_users.js
├── simulith/               # Simulation engine
│   ├── src/agents/         # Persona spawners, belief state, mesh allocator
│   ├── src/engine/         # Tick engine, simulator, scoring, report gen
│   ├── src/graph/          # Knowledge graph, domain matching
│   ├── src/db/             # SQLite agent memory store
│   ├── src/llm/            # Unified AI interface
│   ├── src/tree/           # MCTS tree mode
│   ├── src/automation/     # Automated scenario runner
│   └── public/             # UI (login, workspace, landing)
├── extension/              # Chrome extension (context capture)
│   ├── core/               # Chunking, embedding, orchestrator
│   ├── db/                 # SQLite, Postgres, remote adapters
│   ├── llm/                # LLM + embedding interfaces
│   └── env/                # Config
├── docker/                 # Container definitions
│   ├── Dockerfile.dev
│   ├── Dockerfile.prod
│   ├── docker-compose.dev.yml
│   ├── docker-compose.prod.yml
│   └── install_docker.sh
├── test/                   # Test suite
├── data/                   # SQLite databases (gitignored)
└── package.json
```

---

## Simulation Modes

| Mode | Description |
|---|---|
| **Mesh** | Multi-round social simulation. Agents publish posts, react to shocks, form factions, and drift beliefs across simulated platforms (Twitter, Reddit, HN, Discord, Facebook). |
| **Council** | Strategic option evaluation. Personas debate decision branches (Aggressive, Defensive, Lateral). Mathematical scoring model computes confidence ratings. |
| **Tree** | Monte Carlo Tree Search. LLM generates semantic operators, deterministic physics engine evaluates state transitions with pruning. |

---

## Quick Start (Docker)

```bash
# Build dev image
./run_memtrace.sh build

# Start (builds if needed, runs on http://localhost:3000)
./run_memtrace.sh up

# Or directly:
docker compose -f memtrace/docker/docker-compose.dev.yml up -d

# Stop
./run_memtrace.sh clean
```

## Quick Start (local Node)

```bash
cd memtrace
cp extension/env/config.example.js extension/env/config.js
npm install
npm start
```

## Running Tests

```bash
./test/run_tests_v2.sh
```

---

## API Endpoints

All endpoints live under `http://localhost:3000` (dev) or `https://simulith.hazeezadebayo.dev`.

### Health

```
GET /health
```

### Ingestion & Search

```
POST /v1/ingest    — Store text context into the knowledge graph
POST /v1/search    — Semantic vector search over stored chunks
GET  /v1/thread/:uuid — Retrieve processed thread
POST /v1/chat      — Chat with LLM using memory context
```

### Simulation

```
POST /api/v4/simulate/mesh      — Start mesh simulation
POST /api/v4/simulate/council    — Start council simulation
POST /api/v4/simulate/tree       — Start tree simulation
GET  /api/v4/jobs-mesh/:id       — Get mesh job status
GET  /api/v4/jobs-council/:id    — Get council job status
GET  /api/v4/jobs-tree/:id       — Get tree job status
GET  /api/v4/state               — Current simulation state
```

### Auth

```
POST /api/auth/google  — Exchange Google ID token for session JWT
GET  /api/auth/me      — Get current user info
POST /api/auth/logout  — Clear session
```

Authentication is via Google OAuth (GSI popup) + server-issued JWT stored in an httpOnly cookie.

---

## Deployment

Push to `main` triggers GitHub Actions (`.github/workflows/deploy.yml`):
1. Builds production Docker image from `Dockerfile.prod`
2. Pushes to `ghcr.io/hazeezadebayo/memtrace-simulith`
3. SSHes into Alibaba SAS, generates `.env` + `docker-compose.prod.yml`
4. Pulls and restarts with `docker compose up -d`

The production stack includes a `cloudflared` sidecar that provides a public HTTPS URL (`https://simulith.hazeezadebayo.dev`) for Google OAuth origin validation.

### Required GitHub Secrets

| Secret | Source |
|---|---|
| `SAS_HOST` | Alibaba SAS public IP |
| `SAS_USER` | SSH user (root) |
| `SAS_SSH_KEY` | SSH private key |
| `QWEN_API_KEY` | Qwen DashScope API key |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → Credentials |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Zero Trust → Networks → Tunnels |

---

## Configuration

Central config: `extension/env/config.js` (reads from environment variables).

Key variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | 3106 | API server port |
| `LLM_PROVIDER` | localllm | LLM backend (qwen, gemini, openai, openrouter, localllm, mock) |
| `LLM_MODEL` | LFM2-2.6B-Q5 | Model name |
| `EMB_PROVIDER` | xenova | Embedding provider (xenova, qwen, openai) |
| `DB_TYPE` | offline | Database mode (offline = SQLite, online = Turso/Postgres) |
| `NODE_ENV` | development | Toggles production optimizations and secure cookies |
