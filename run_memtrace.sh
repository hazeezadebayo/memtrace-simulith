#!/bin/bash

# run_memtrace.sh - Lifecycle management for MemTrace Decision Simulator
# Supports: build, up, clean, kill

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/memtrace"
DOCKER_DIR="$PROJECT_ROOT/docker"

function ensure_env() {
    CICD_DIR="$SCRIPT_DIR/memtrace_cicd"
    CICD_ENV="$CICD_DIR/.env"
    ROOT_EXAMPLE="$SCRIPT_DIR/.env.example"

    if [ ! -f "$CICD_ENV" ]; then
        echo "📂 Creating missing memtrace_cicd directory..."
        mkdir -p "$CICD_DIR"
        
        if [ -f "$ROOT_EXAMPLE" ]; then
            echo "📝 Initializing single source of truth .env from .env.example..."
            cp "$ROOT_EXAMPLE" "$CICD_ENV"
        else
            echo "❌ Error: .env.example is missing at the root. Cannot initialize .env."
            exit 1
        fi
    fi
}


function usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  build   Build the docker images"
    echo "  up      Start the containers in background"
    echo "  clean   Remove containers and orphans"
    echo "  kill    Stop and remove containers"
    echo "  help    Show this help message"
    echo ""
    echo "--------------------------------------------------"
    echo "Available Endpoints:"
    echo "--------------------------------------------------"
    echo "  Base API (v1):"
    echo "    GET  /health             - Health check"
    echo "    POST /v1/ingest          - Ingest conversation data"
    echo "    GET  /v1/thread/:uuid    - Get processed thread"
    echo "    POST /v1/search          - Vector search"
    echo "  Pivot API (v4):"
    echo "    POST /api/v4/simulate    - Run decision simulation"
    echo "    GET  /api/v4/state       - Get current simulation state"
    echo "    GET  /simulith/landing.html             - Access Decision Simulator UI"
    echo ""
    echo "--------------------------------------------------"
    echo "Examples & Usage:"
    echo "--------------------------------------------------"
    echo "Example 1: Health Check (Is the wooden world alive?)"
    echo "curl http://localhost:3000/health"
    echo ""
    echo "Example 2: Ingest (Branchy the stick boy makes a wish)"
    echo 'curl -X POST http://localhost:3000/v1/ingest -H "Content-Type: application/json" -H "Authorization: Bearer test-key-123" -d "{\"text\": \"Once there was a stick boy named Branchy who wished to be a real boy.\", \"uuid\": \"stick-boy-001\"}"'
    echo ""
    echo "Example 3: Ingest (The Magic Spring transformation)"
    echo 'curl -X POST http://localhost:3000/v1/ingest -H "Content-Type: application/json" -H "Authorization: Bearer test-key-123" -d "{\"text\": \"Branchy drank from the Magic Spring and felt his wooden bark turn into soft skin.\", \"uuid\": \"stick-boy-001\"}"'
    echo ""
    echo "Example 4: Retrieve Thread (The history of Branchy's dream)"
    echo "curl -H \"Authorization: Bearer test-key-123\" http://localhost:3000/v1/thread/stick-boy-001"
    echo ""
    echo "Example 5: Search (Looking for the Magic in the records)"
    echo 'curl -X POST http://localhost:3000/v1/search -H "Content-Type: application/json" -H "Authorization: Bearer test-key-123" -d "{\"query\": \"magic spring transformation\", \"uuid\": \"stick-boy-001\"}"'
    echo ""
    echo "Example 6: Chat (Ask about Branchy's future)"
    echo 'curl -X POST http://localhost:3000/v1/chat -H "Content-Type: application/json" -H "Authorization: Bearer test-key-123" -d "{\"prompt\": \"What happened to Branchy after he became a real boy?\", \"max_tokens\": 100}"'
    echo ""
    echo "Example 7: Simulation (Pivot v4 - The Decision Engine)"
    echo 'curl -X POST http://localhost:3000/api/v4/simulate -H "Content-Type: application/json" -d "{\"question\": \"Should Branchy return to the forest?\", \"facts\": [\"The forest is safe\", \"The city is exciting\"]}"'
    echo ""
    echo "Enjoy using MemTrace!"
}

case "$1" in
    build)
        ensure_env
        echo "🏗️ Building MemTrace images..."
        cd "$DOCKER_DIR" && docker compose -f docker-compose.dev.yml build
        ;;
    up)
        ensure_env
        echo "🚀 Starting MemTrace..."
        cd "$DOCKER_DIR" && docker compose -f docker-compose.dev.yml up -d
        echo "⏳ Waiting for API..."
        # Wait for health check (max 5 minutes for model downloads)
        MAX_RETRIES=300
        RETRY_COUNT=0
        until curl -s http://localhost:3000/health > /dev/null || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
          sleep 1
          RETRY_COUNT=$((RETRY_COUNT + 1))
        done
        
        if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
          echo "❌ Error: API failed to start in time. Check docker logs."
          exit 1
        fi

        echo "✅ MemTrace is ready at http://localhost:3000"
        echo "✅ Simulith UI is ready at http://localhost:3000/simulith/landing.html"
        echo ""
        usage
        ;;
    clean)
        echo "🧹 Cleaning up..."
        cd "$DOCKER_DIR" && docker compose -f docker-compose.dev.yml down --remove-orphans
        ;;
    kill)
        echo "🛑 Killing MemTrace..."
        if [ -d "$DOCKER_DIR" ]; then
            (cd "$DOCKER_DIR" && docker compose -f docker-compose.dev.yml down) 2>/dev/null || true
        fi
        
        echo "🛑 Killing local Node.js server instances..."
        # Target processes running api/server.js
        PIDS=$(pgrep -f "api/server.js" || true)
        if [ -n "$PIDS" ]; then
            for PID in $PIDS; do
                echo "Killing local process $PID..."
                kill -9 "$PID" 2>/dev/null || true
            done
        fi
        
        # Dynamically resolve the port from the environment or configuration
        CONFIG_FILE="$PROJECT_ROOT/extension/env/config.js"
        RESOLVED_PORT=$(grep -oE "port:\s*[0-9]+" "$CONFIG_FILE" 2>/dev/null | grep -oE "[0-9]+" || echo 3106)
        TARGET_PORT=${PORT:-$RESOLVED_PORT}
        
        # Target process listening on the resolved port
        PORT_PID=$(lsof -t -i :$TARGET_PORT 2>/dev/null || true)
        if [ -n "$PORT_PID" ]; then
            for PPID in $PORT_PID; do
                echo "Killing process $PPID listening on configured port $TARGET_PORT..."
                kill -9 "$PPID" 2>/dev/null || true
            done
        fi
        ;;
    help|*)
        usage
        ;;
esac
