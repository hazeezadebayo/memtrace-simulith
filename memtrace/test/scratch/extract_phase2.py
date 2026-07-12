import os

with open('api/memtrace_server.js', 'r') as f:
    memtrace_lines = f.readlines()

def get_lines(lines, start, end):
    return lines[start-1:end]

# Extracted lines for core_memory_server.js
core_memory_lines = [
    "import express from 'express';\n",
    "import { authenticate } from './auth_server.js';\n",
    "import { upsertChunk, getChunk, deleteChunk, search } from '../extension/core/memory.js';\n\n",
    "const router = express.Router();\n\n",
    "let orchestrator = null;\n",
    "let LLM = null;\n",
    "export function injectCoreDependencies(orch, llmInstance) {\n",
    "    orchestrator = orch;\n",
    "    LLM = llmInstance;\n",
    "}\n\n",
]

# The endpoints in memtrace_server.js are from line 134 to 277 (app.post('/v1/ingest', ... to end of /v1/search/vector))
v1_endpoints = "".join(get_lines(memtrace_lines, 134, 277)).replace('app.post', 'router.post').replace('app.get', 'router.get').replace('app.put', 'router.put').replace('app.delete', 'router.delete')

core_memory_lines.append(v1_endpoints)
core_memory_lines.append("\nexport default router;\n")

with open('api/core_memory_server.js', 'w') as f:
    f.writelines(core_memory_lines)

# Update memtrace_server.js to remove those endpoints and add the new mount
new_memtrace_lines = memtrace_lines[:124] # up to import { upsertChunk, ...
new_memtrace_lines.extend([
    "// === ENDPOINTS ===\n",
    "app.get('/health', (req, res) => res.json({ status: 'ok', db: dbType }));\n\n",
    "import coreMemoryRouter, { injectCoreDependencies } from './core_memory_server.js';\n",
    "injectCoreDependencies(orchestrator, LLM);\n",
    "app.use('/', coreMemoryRouter);\n\n",
])
new_memtrace_lines.extend(memtrace_lines[278:]) # from // === SERVER === to EOF

with open('api/memtrace_server.js', 'w') as f:
    f.writelines(new_memtrace_lines)


# Now extract from simulith_server.js
with open('api/simulith_server.js', 'r') as f:
    simulith_lines = f.readlines()

memtrace_mode_lines = [
    "import express from 'express';\n",
    "import { authenticate } from './auth_server.js';\n",
    "import { JobQueue } from '../simulith/src/utils/queue.js';\n",
    "import { getLLMCallCount, resetLLMCallCount, checkInjectionGuardrail } from '../extension/core/llm_agent.js';\n",
    "import { orchestratorConfig } from './simulith_server.js';\n\n",
    "const router = express.Router();\n\n",
]

# Memtrace mode endpoints in simulith_server.js: 233 to 409
memtrace_mode_lines.append("".join(get_lines(simulith_lines, 233, 409)))
memtrace_mode_lines.append("\nexport default router;\n")

with open('api/memtrace_mode_server.js', 'w') as f:
    f.writelines(memtrace_mode_lines)

telemetry_lines = [
    "import express from 'express';\n",
    "import { authenticate } from './auth_server.js';\n\n",
    "const router = express.Router();\n\n",
]
# Telemetry endpoints in simulith_server.js: 411 to 689
telemetry_lines.append("".join(get_lines(simulith_lines, 411, 689)))
telemetry_lines.append("\nexport default router;\n")

with open('api/telemetry_server.js', 'w') as f:
    f.writelines(telemetry_lines)

# Remove those lines from simulith_server.js
new_simulith_lines = simulith_lines[:232]
new_simulith_lines.append("\nexport default router;\n")

with open('api/simulith_server.js', 'w') as f:
    f.writelines(new_simulith_lines)

