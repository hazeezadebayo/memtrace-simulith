import re

with open('api/council_router.js', 'r') as f:
    lines = f.readlines()

def get_lines(start, end):
    # 1-indexed to 0-indexed slice
    return lines[start-1:end]

simulith_lines = []
council_lines = []
mesh_lines = []
tree_lines = []

# SIMULITH SERVER
simulith_lines.extend([
    "import express from 'express';\n",
    "import path from 'node:path';\n",
    "import { fileURLToPath } from 'node:url';\n",
    "import { JobQueue } from '../simulith/src/utils/queue.js';\n",
    "import { simulateScenario } from '../simulith/src/engine/simulator.js';\n",
    "import { loadState, saveState, recordOutcome } from '../simulith/src/utils/council_utils.js';\n",
    "import { authenticate, enforceOrigin } from './auth_server.js';\n",
    "import { getUser } from './db_users.js';\n",
    "import { getLLMCallCount, resetLLMCallCount, checkInjectionGuardrail } from '../extension/core/llm_agent.js';\n",
    "\n",
    "const __filename = fileURLToPath(import.meta.url);\n",
    "const __dirname = path.dirname(__filename);\n",
    "const router = express.Router();\n",
    "router.use(enforceOrigin);\n",
    "\n",
    "export const orchestratorConfig = { orchestrator: null };\n",
    "export function injectOrchestrator(orch) {\n",
    "  orchestratorConfig.orchestrator = orch;\n",
    "}\n\n",
])

# Now adapt the original queue definition to use orchestratorConfig.orchestrator
queue_def = get_lines(21, 150)
for i, line in enumerate(queue_def):
    queue_def[i] = line.replace('orchestrator', 'orchestratorConfig.orchestrator')
# Actually, the replacement might mess up variables named orchestrator locally, 
# but in the queue definition `if (payload.uuid && orchestrator)` is used.
queue_def = "".join(queue_def).replace('orchestratorConfig.orchestratorConfig', 'orchestratorConfig') # safety
simulith_lines.append("export " + queue_def.replace('const queue =', 'const queue ='))

simulith_lines.extend(get_lines(152, 171)) # safeNumber, normalizeRequest
simulith_lines.append("export { safeNumber };\n\n")

simulith_lines.extend(get_lines(176, 193)) # /health, /state, /runs
simulith_lines.extend(get_lines(284, 325)) # /settings, /recluster, /outcome

# Memtrace API Endpoints (701-808)
memtrace_def = "".join(get_lines(701, 808)).replace('orchestrator', 'orchestratorConfig.orchestrator')
simulith_lines.append("export " + memtrace_def.replace('const memtraceQueue =', 'const memtraceQueue ='))
simulith_lines.extend(get_lines(947, 1015)) # /memtrace/jobs/:id etc
simulith_lines.extend(get_lines(1017, 1297)) # Billing & Admin

simulith_lines.append("\nexport default router;\n")

# COUNCIL SERVER
council_lines.extend([
    "import express from 'express';\n",
    "import { authenticate, enforceOrigin } from './auth_server.js';\n",
    "import { getUser } from './db_users.js';\n",
    "import { loadState, saveState, recenterPersona } from '../simulith/src/utils/council_utils.js';\n",
    "import { getLLMCallCount, checkInjectionGuardrail } from '../extension/core/llm_agent.js';\n",
    "import { queue, safeNumber, orchestratorConfig } from './simulith_server.js';\n",
    "\n",
    "const router = express.Router();\n",
    "router.use(enforceOrigin);\n\n",
])
council_lines.extend(get_lines(195, 244)) # /simulate/council, /jobs/:id
council_lines.extend(get_lines(247, 282)) # /personas
council_lines.append("".join(get_lines(327, 449)).replace('orchestrator', 'orchestratorConfig.orchestrator')) # /resimulate, /ingest
council_lines.append("\nexport default router;\n")


# MESH SERVER
mesh_lines.extend([
    "import express from 'express';\n",
    "import { JobQueue } from '../simulith/src/utils/queue.js';\n",
    "import { simulateMesh } from '../simulith/src/engine/simulator.js';\n",
    "import { authenticate, enforceOrigin } from './auth_server.js';\n",
    "import { getUser } from './db_users.js';\n",
    "import { getLLMCallCount, resetLLMCallCount, checkInjectionGuardrail } from '../extension/core/llm_agent.js';\n",
    "import { safeNumber, orchestratorConfig } from './simulith_server.js';\n",
    "\n",
    "const router = express.Router();\n",
    "router.use(enforceOrigin);\n\n",
])
mesh_lines.append("".join(get_lines(453, 699)).replace('orchestrator', 'orchestratorConfig.orchestrator'))
mesh_lines.append("\nexport default router;\n")


# TREE SERVER
tree_lines.extend([
    "import express from 'express';\n",
    "import { authenticate, enforceOrigin } from './auth_server.js';\n",
    "import { getUser } from './db_users.js';\n",
    "import { checkInjectionGuardrail } from '../extension/core/llm_agent.js';\n",
    "import { safeNumber } from './simulith_server.js';\n",
    "\n",
    "const router = express.Router();\n",
    "router.use(enforceOrigin);\n\n",
])
tree_lines.extend(get_lines(810, 945))
tree_lines.append("\nexport default router;\n")


with open('api/simulith_server.js', 'w') as f: f.writelines(simulith_lines)
with open('api/council_server.js', 'w') as f: f.writelines(council_lines)
with open('api/mesh_server.js', 'w') as f: f.writelines(mesh_lines)
with open('api/tree_server.js', 'w') as f: f.writelines(tree_lines)

