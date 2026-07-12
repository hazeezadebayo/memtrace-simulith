# MemTrace Docker Setup & Usage Guide

This directory contains the necessary configuration to run **MemTrace (Decision Simulator & Threadlet Orchestrator)** in a containerized environment, ensuring reproducibility and host isolation.

## 1. Installation (Debian/Linux)

We provide a helper script to install Docker Engine and Docker Compose.

### Step 1: Run the Installer
Navigate to the project root and run:
```bash
chmod +x memtrace/docker/install_docker.sh
sudo ./memtrace/docker/install_docker.sh
```

### Step 2: Fix Permissions
By default, Docker requires `sudo`. To run it as your current user:
1. `sudo usermod -aG docker $USER`
2. Log out and log back in, or run `newgrp docker`.

---

## 2. Running the Project

The containerized environment builds the entire MemTrace stack, including the **Decision Engine** and the **Threadlet API**.

### Start everything
From the project root, use the lifecycle script (Recommended):
```bash
./run_memtrace.sh up
```

Or run manually via docker compose:
```bash
docker compose -f memtrace/docker/docker-compose.yml up -d
```

### Services Available
- **Integrated API**: `http://localhost:3000`
- **Decision Simulator UI**: `http://localhost:3000/council/`
- **Simulation API**: `http://localhost:3000/api/v4/`

---

## 3. Persistence

The `docker-compose.yml` configures two critical volumes for persistence:
1. `/app/data/memtrace.sqlite`: Stores your threadlet memory graph.
2. `/app/simulith/data`: Stores your decision simulation state, settings, and historical runs.

---

## 4. Testing in Docker

To verify the system within the container:
```bash
# Run the full test suite
docker compose -f memtrace/docker/docker-compose.yml up test-suite
```

---

## 5. Deployment Notes

- **Identity**: The project has counciled to a Decision Simulator. The Docker setup reflects this by prioritizing port 3000 for the unified dashboard.
- **Portability**: The `node:20-slim` base image ensures a small, performant runtime environment.
- **Security**: The `API_KEYS` environment variable should be set in production to protect the ingestion and simulation endpoints.
