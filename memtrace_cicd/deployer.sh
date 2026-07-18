#!/usr/bin/env bash
# =============================================================================
# MEMTRACE CI/CD DEPLOYER v2 — JSC Binary + Obfuscation Hybrid
# =============================================================================
echo "🚀 MEMTRACE HF DEPLOYER v2 STARTING..."
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MEMTRACE_DIR="$PROJECT_ROOT/memtrace"
ENV_FILE="${SCRIPT_DIR}/.env"

# ── Env validation ─────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then echo "❌ .env not found at $ENV_FILE" >&2; exit 1; fi
set -a; source "$ENV_FILE"; set +a
: "${HF_TOKEN:?Missing HF_TOKEN}"
: "${HF_USERNAME:?Missing HF_USERNAME}"
: "${HF_SPACE_NAME:?Missing HF_SPACE_NAME}"
extract() { grep -E "^${1}=" "$ENV_FILE" | cut -d= -f2- | tr -d '\r"'"'" | xargs || true; }

# ── Retry wrapper ──────────────────────────────────────────────────────────
retry_cmd() {
    local cmd=("$@"); local n=1; local max=5; local delay=5
    while true; do
        "${cmd[@]}" && return 0
        (( n >= max )) && { echo "❌ Failed after $max attempts: ${cmd[*]}" >&2; return 1; }
        echo "⚠️  Attempt $n/$max failed. Retrying in ${delay}s..." >&2
        ((n++)); sleep "$delay"
    done
}

# =============================================================================
# FILE CLASSIFICATION LISTS
# =============================================================================

# ✅ JSC-SAFE: Pure ESM modules, no top-level await, no import.meta, no circular dynamic imports
JSC_FILES=(
    "simulith/src/agents/belief_state.js"
    "simulith/src/engine/scoring.js"
    "simulith/src/data/manifest.js"
    "simulith/src/agents/personas.js"
    "simulith/src/graph/graph_ontology.js"
    "simulith/src/graph/knowledge_graph.js"
    "simulith/src/engine/tick_engine.js"
    "simulith/src/agents/generative.js"
    "simulith/src/data/evidence.js"
    "simulith/src/engine/report_generator.js"
    "simulith/src/llm/ai.js"
    "simulith/src/utils/queue.js"
    "simulith/src/agents/recluster.js"
    "simulith/src/utils/extra.js"
    "simulith/src/utils/visualize.js"
    "simulith/src/utils/crawler.js"
    "simulith/src/graph/domain_matcher.js"
    "simulith/src/engine/memtrace_engine.js"
    "simulith/src/agents/mesh.js"
    "simulith/src/agents/memtrace_mesh.js"
    "simulith/src/data/ontology.js"
    "simulith/src/data/shocks.js"
    "simulith/src/utils/council_utils.js"
    "simulith/src/utils/tree_runtime_utils.js"
    "simulith/src/llm/orchestrator_adapter.js"
    "simulith/src/tree/elasticity.js"
    "simulith/src/tree/estimation_engine.js"
    "simulith/src/tree/operator_generator.js"
    "simulith/src/tree/perturbation_engine.js"
    "simulith/src/tree/probability_engine.js"
    "simulith/src/tree/query_adapter.js"
    "simulith/src/tree/state_encoder.js"
    "simulith/src/tree/transition_engine.js"
    "simulith/src/tree/tree_builder.js"
    "simulith/src/tree/utility_scorer.js"
    "simulith/src/automation/divergence_engine.js"
    "simulith/src/automation/epistemology_router.js"
    "simulith/src/automation/index.js"
    "simulith/src/automation/utils.js"
    "extension/core/chunker.js"
    "extension/core/memory.js"
    "extension/core/llm-limiter.js"
    "extension/core/utils.js"
    "extension/core/llm_agent.js"
    "extension/llm/agent.js"
    "extension/db/abstraction.js"
    "extension/db/memory-factory.js"
    "extension/db/postgres-adapter.js"
    "extension/db/remote-adapter.js"
    "extension/db/sqlite-adapter.js"
    "extension/db/alibaba_cloud_rds_adapter.js"
    # tools — tool registry + tool implementations
    "simulith/src/tools/Tool.js"
    "simulith/src/tools/ToolRegistry.js"
    "simulith/src/tools/CheckFactsTool.js"
    "simulith/src/tools/TimelineProjectionTool.js"
    "simulith/src/tools/search/SearchAdapter.js"
    "simulith/src/tools/search/WikipediaAdapter.js"
)

# 🔧 JSC-FIXABLE (grouped as obfuscation per user decision — safer, zero risk)
# ❌ JSC-INCOMPATIBLE (entry points / top-level await / deep circular dynamic imports)
# Both categories receive aggressive javascript-obfuscator treatment.
OBFUSCATE_FILES=(
    # FIXABLE — dynamic imports or import.meta.url (user chose safer obfuscation path)
    "simulith/src/db/agent_memory.js"
    "simulith/src/engine/simulator.js"
    "extension/core/orchestrator.js"
    "extension/core/helper.js"
    "extension/llm/offline_llm.js"
    "extension/llm/embedding.js"
    "api/db_users.js"
    # INCOMPATIBLE — entry points with top-level await (structural — cannot be JSC)
    "api/automation_router.js"
    "api/memtrace_server.js"
    "api/auth_server.js"
    "api/auth_secret.js"
    "api/council_server.js"
    "api/mesh_server.js"
    "api/tree_server.js"
    "api/simulith_server.js"
    "api/memtrace_mode_server.js"
    "api/persona_server.js"
    "api/telemetry_server.js"
    "api/core_memory_server.js"
    # Browser extension files
    "extension/background.js"
    "extension/content.js"
    "extension/popup.js"
    # Frontend JS files
    "simulith/public/app.js"
    "simulith/public/visualize.js"
    "simulith/public/tutorial_physics.js"
)
# NOTE: extension/utils/transformers.min.js is 3rd-party pre-minified browser bundle.
# It is left untouched — obfuscating a pre-minified bundle breaks it.

# =============================================================================
# FUNCTION: compile_to_jsc
# Converts a single ESM .js file → CJS → .jsc binary, then writes a thin
# 2-line CJS shim back in its place so require() from other files still works.
# =============================================================================
compile_to_jsc() {
    local rel_path="$1"
    local abs_path="$DEPLOY_DIR/$rel_path"
    local base; base="$(basename "$rel_path" .js)"
    local dir;  dir="$(dirname "$abs_path")"
    local tmp_cjs="/tmp/jsc_work/${base}_$$.cjs"
    local jsc_out="${abs_path%.js}.jsc"

    mkdir -p /tmp/jsc_work

    # Step 1: Transform ESM syntax → CJS using esbuild (syntax transform, no bundling)
    if ! npx --prefix "$MEMTRACE_DIR" esbuild "$abs_path" \
        --platform=node \
        --format=cjs \
        --outfile="$tmp_cjs" 2>/dev/null; then
        echo "  ⚠️  esbuild failed for $rel_path — falling back to obfuscation" >&2
        obfuscate_file "$rel_path"
        return
    fi

    # Step 2: Compile CJS to V8 bytecode (.jsc) using bytenode
    if ! node -e "
        require('${MEMTRACE_DIR}/node_modules/bytenode');
        require('bytenode').compileFile({
            filename: '${tmp_cjs}',
            output:   '${jsc_out}'
        });
    " 2>/dev/null; then
        echo "  ⚠️  bytenode failed for $rel_path — falling back to obfuscation" >&2
        rm -f "$tmp_cjs"
        obfuscate_file "$rel_path"
        return
    fi

    # Step 3: Write a thin 2-line CJS shim that loads the .jsc binary.
    # Other require('./filename.js') calls resolve to this shim, which
    # loads bytenode (registers .jsc handler) and returns the binary's exports.
    printf "require('bytenode');\nmodule.exports = require('./%s.jsc');\n" "$base" > "$abs_path"

    rm -f "$tmp_cjs"
    echo "  ✅ $rel_path → $base.jsc"
}

# =============================================================================
# FUNCTION: obfuscate_file
# Runs javascript-obfuscator at maximum strength on a single .js file in-place.
# =============================================================================
obfuscate_file() {
    local rel_path="$1"
    local abs_path="$DEPLOY_DIR/$rel_path"

    if [[ ! -f "$abs_path" ]]; then
        echo "  ⚠️  $rel_path not found — skipping" >&2
        return
    fi

    local extra_args=""
    if [[ "${EXTREME_OBFUSCATION:-false}" == "true" ]]; then
        extra_args="--self-defending true --debug-protection true --debug-protection-interval 4000 --disable-console-output true --string-array-encoding rc4 --control-flow-flattening-threshold 1.0"
        echo "    💀 Applying EXTREME obfuscation settings..."
    else
        extra_args="--string-array-encoding base64 --control-flow-flattening-threshold 0.75"
    fi

    npx --prefix "$MEMTRACE_DIR" javascript-obfuscator "$abs_path" \
        --output "$abs_path" \
        --compact true \
        --control-flow-flattening true \
        --dead-code-injection true \
        --dead-code-injection-threshold 0.4 \
        --identifier-names-generator hexadecimal \
        --rename-globals true \
        --string-array true \
        --string-array-calls-transform true \
        --string-array-calls-transform-threshold 0.5 \
        --split-strings true \
        --split-strings-chunk-length 10 \
        --ignore-require-imports true $extra_args 2>/dev/null

    echo "  🌀 $rel_path → obfuscated"
}

# =============================================================================
# PHASE 1: Secrets & Environment
# =============================================================================
echo "🔐 Phase 1 – Environment"
HF_TOKEN_VAL=$(extract "HF_TOKEN")
[[ -n "$HF_TOKEN_VAL" ]] && echo "✓ HF_TOKEN found" || { echo "❌ HF_TOKEN missing" >&2; exit 1; }
echo "✓ Target: https://huggingface.co/spaces/${HF_USERNAME}/${HF_SPACE_NAME}"

# =============================================================================
# PHASE 1.5: Hugging Face API Provisioning
# =============================================================================
echo ""
echo "🤖 Phase 1.5 – Hugging Face API Provisioning (Space & Secrets)"
if node "$SCRIPT_DIR/hf_secrets_sync.js"; then
    echo "✅ API Provisioning completed successfully."
else
    echo "❌ ERROR: Hugging Face API Provisioning failed." >&2
    exit 1
fi

# =============================================================================
# PHASE 2: Isolation — copy project to staging dir
# =============================================================================
echo ""
echo "📂 Phase 2 – Isolating source to staging..."
DEPLOY_DIR="/tmp/memtrace_deploy_src"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
cp -a "$MEMTRACE_DIR/." "$DEPLOY_DIR/"
cd "$DEPLOY_DIR"

# ── STRIP: Remove everything that must NEVER go to Hugging Face ──────────────
echo "🧹 Stripping sensitive and dev-only files..."

# Dev tooling — never publish
rm -rf .git
rm -rf test/
rm -rf scratch/
rm -f output_log.md git_workflow.md

# ⚠️  SENSITIVE: Live databases (contain user password hashes and sim data)
rm -rf data/
echo "  ✓ data/ stripped (SQLite databases — sensitive)"

# ⚠️  SENSITIVE: Live config with API keys — replace with environment-driven example config
rm -f extension/env/config.js
cp extension/env/config.example.js extension/env/config.js
echo "  ✓ extension/env/config.js replaced with safe env-driven template"

# Runtime state files — generated at runtime, not needed in deploy
find . -name "state.json" -delete
echo "  ✓ state.json runtime files stripped"

# Large model binary — HF downloads this on first boot via offline_llm.js
rm -rf models/*.gguf
echo "  ✓ models/*.gguf stripped (download on boot — too large for git)"

# Gradio Bypass configuration — copy app.py to root for HF Spaces, nuke docker to prevent leaks
cp "$SCRIPT_DIR/app.py" app.py
rm -rf docker/
echo "  ✓ docker/ directory stripped (preventing .env leaks) and app.py Gradio bypass copied to root"

# Strip any stray root or cicd .env files to prevent secrets leakage
find . -name ".env" -delete
echo "  ✓ stray .env files stripped"

# Internal documentation — no value in publishing
rm -rf md/
echo "  ✓ md/ internal docs stripped"

# Source maps — assist reverse engineering, strip them all
find . -name "*.js.map" -delete
echo "  ✓ Source maps (.js.map) stripped"

# TypeScript declaration files — expose your full API surface to attackers
find . -name "*.d.ts" -delete
echo "  ✓ TypeScript declarations (.d.ts) stripped"

# node_modules — HF runs npm install on deploy from package.json
rm -rf node_modules
echo "  ✓ node_modules stripped"

echo "✅ Staging ready at $DEPLOY_DIR"

# =============================================================================
# PHASE 3: Convert project to CJS (removes ESM module type)
# This is required so bytenode (.jsc) shims work via require().
# =============================================================================
echo ""
echo "⚙️  Phase 3 – Converting package.json to CJS mode..."
node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    delete p.type;
    p.dependencies = p.dependencies || {};
    p.dependencies.bytenode = '*';
    fs.writeFileSync('package.json', JSON.stringify(p, null, 2));
"
echo "✅ package.json: 'type: module' removed, bytenode added to dependencies"

# =============================================================================
# PHASE 4: Compile JSC files
# =============================================================================
echo ""
echo "🔒 Phase 4 – Compiling ${#JSC_FILES[@]} files to V8 bytecode (.jsc)..."
jsc_ok=0; jsc_fail=0
for file in "${JSC_FILES[@]}"; do
    if [[ -f "$DEPLOY_DIR/$file" ]]; then
        compile_to_jsc "$file" && ((jsc_ok++)) || ((jsc_fail++))
    else
        echo "  ⚠️  Not found: $file" >&2
    fi
done
echo "✅ JSC compilation done: $jsc_ok compiled, $jsc_fail fell back to obfuscation"
rm -rf /tmp/jsc_work

# =============================================================================
# PHASE 5: Obfuscate entry-point and fixable files
# =============================================================================
echo ""
echo "🌀 Phase 5 – Obfuscating ${#OBFUSCATE_FILES[@]} entry-point/fixable files..."
for file in "${OBFUSCATE_FILES[@]}"; do
    obfuscate_file "$file"
done
echo "✅ Obfuscation complete"

# =============================================================================
# PHASE 6: Git init & push to Hugging Face
# =============================================================================
echo ""
echo "📤 Phase 6 – Pushing to Hugging Face..."

git init
git lfs install
git lfs track "*.jsc" "*.gguf" "*.bin" "*.onnx" "*.so" "*.node"
git add .gitattributes

git config user.email "deployer@memtrace.ai"
git config user.name "HF Deployer"
git config --add safe.directory "$(pwd)"

HF_REMOTE="https://${HF_USERNAME}:${HF_TOKEN_VAL}@huggingface.co/spaces/${HF_USERNAME}/${HF_SPACE_NAME}"
git remote add hf "$HF_REMOTE"

git add .
git commit -m "Deploy: $(date +'%Y-%m-%d %H:%M:%S') — JSC+Obfuscation hybrid"

echo "🚀 Force pushing to Hugging Face..."
if retry_cmd git push hf HEAD:main --force; then
    echo ""
    echo "-------------------------------------------------------"
    echo "✅ DEPLOYMENT COMPLETE!"
    echo "🌍 https://huggingface.co/spaces/${HF_USERNAME}/${HF_SPACE_NAME}"
    echo "-------------------------------------------------------"
else
    echo "❌ Push failed" >&2
    exit 1
fi
