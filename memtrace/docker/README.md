# MemTrace Docker

This directory contains container definitions for local development and production deployment.

## Files

| File | Purpose |
|---|---|
| `Dockerfile.dev` | Dev image — includes build tools (python3, make, g++, cmake) for native modules |
| `Dockerfile.prod` | Slim production image — no build tools, runs as `node` user |
| `docker-compose.dev.yml` | Dev stack — mounts source code as volumes for live editing |
| `docker-compose.prod.yml` | Production stack — used by GitHub Actions deploy, includes cloudflared tunnel |
| `install_docker.sh` | One-time Docker Engine + Compose installer for Debian |

## Usage

### Local development

From the project root:

```bash
# Via lifecycle script (recommended)
./run_memtrace.sh build   # Build the dev image
./run_memtrace.sh up      # Start (builds if needed, then runs)
./run_memtrace.sh clean   # Stop and remove containers

# Via docker compose directly
docker compose -f memtrace/docker/docker-compose.dev.yml up -d
```

The app is available at `http://localhost:3000`.

### Production deployment

Push to `main` — GitHub Actions (`.github/workflows/deploy.yml`) handles the rest:
1. Builds the image using `Dockerfile.prod`
2. Pushes to GHCR (`ghcr.io/hazeezadebayo/memtrace-simulith`)
3. SSHes into Alibaba SAS, generates `.env` + `docker-compose.prod.yml`, pulls, and restarts

## Cloudflare Tunnel

`docker-compose.prod.yml` includes a `cloudflared` sidecar that provides a public HTTPS URL for Google Sign-In. After deploy:

1. Check the tunnel connected: `docker logs memtrace_cloudflared`
2. In Cloudflare Zero Trust → Networks → Tunnels, configure a public hostname
3. Service URL: `http://memtrace:3106`
4. Add the HTTPS URL to Google Cloud Console → Authorized JavaScript origins
