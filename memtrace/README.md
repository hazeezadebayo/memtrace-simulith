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

## TLDR — System Deep Dive

### What MemTrace Is

MemTrace is a **multi-agent social simulation platform** that spawns autonomous LLM-driven agents, runs them through structured interaction rounds, and measures emergent properties: belief drift, faction formation, consensus polarization, and decision confidence. It operates in three distinct simulation modes — Council, Mesh, and Tree — each with its own engine.

Three separate LLM call patterns power the system:
- **Generative LLM calls** — agent backstories, posts, replies, branch proposals, cross-examinations
- **Classification LLM calls** — domain detection, sentiment scoring, edge sentiment, stance extraction
- **Deterministic math** — transition physics, elasticity models, probability softmax, scoring heuristics

---

### Database Schema

Two SQLite databases, managed via libSQL/Turso:

**`data/memtrace.sqlite`** — Simulation & user state

| Table | Key Columns | Purpose |
|---|---|---|
| `mesh_simulations` | id, uuid, scenario, tick_count, agent_count, status | Mesh simulation lifecycle |
| `tree_simulations` | id, uuid, scenario, status | Tree simulation lifecycle |
| `mesh_agents` | id, sim_id, name, platform, beliefs(JSON), traits | Per-simulation agent definitions |
| `mesh_interactions` | id, sim_id, tick, agent_id, type, content | All posts, replies, likes |
| `mesh_edges` | id, sim_id, src_agent, dst_agent, weight, valid_at | Temporal agent relationship graph |
| `memtrace_rounds` | id, sim_id, round, global_summary, shock_event | Council round summaries |
| `user_settings` | uuid, settings_json, cluster_version | User preferences |
| `user_personas` | uuid+id, name, cluster, traits, wins/losses | User-created persona library |
| `user_stats` | uuid, stats_json | Aggregated outcome statistics |
| `user_runs` | uuid+id, run_json, created_at | Historical simulation runs |

**`data/users.db`** — Auth & billing

| Table | Key Columns | Purpose |
|---|---|---|
| `users` | id, google_id, email, memtrace_uuid, tokens | User accounts, token balances |
| `token_requests` | id, memtrace_uuid, amount, status | Admin token approval workflow |

**`extension/db/sqlite-adapter.js`** creates a `chunks` table with FTS5 for the context memory store:
- `chunks(id, uuid, text, embedding, tags, edges, url, created_at, summary, meta)` — indexed by uuid and url, with FTS5 virtual table for full-text search

---

### Council Mode — Strategic Deliberation

Evaluates decision options by subjecting them to a panel of LLM-generated personas that debate, cross-examine, and score strategic branches.

```
POST /api/v4/simulate/council
         │
         ▼
┌─────────────────────────────────────────────┐
│  council_server.js                           │
│  • checkInjectionGuardrail()                 │
│  • getUser() → token forecast                │
│  • queue.enqueue() → returns { jobId }       │
└────────────────────┬────────────────────────┘
                     │ background job
                     ▼
┌─────────────────────────────────────────────┐
│  simulith_server.js (processJob)             │
│  • orchestrator.search() → RAG top-2 facts  │
│  • loadState(uuid)                          │
│  • normalizeRequest()                       │
└────────────────────┬────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  simulator.js  — simulateScenario()                              │
│                                                                  │
│  ┌─ parseScenario() ──────────────────────────────────────────┐ │
│  │  Normalizes question, facts, customPersonas, counts         │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│  ┌─ generative.js: determineDomainAndAudience() ─────────────┐  │
│  │  [1 LLM call] Classifies question into domain + audience  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌─ domain_matcher.js: normalizeToBranchDomain() ────────────┐  │
│  │  Cosine-similarity match against CANONICAL_DOMAINS list   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌─ evidence.js: buildEvidenceProfile() ─────────────────────┐  │
│  │  [1 LLM call] Classifies facts into support/risk/signals  │  │
│  │  /contradictions. Builds tension map for contradiction    │  │
│  │  graph.                                                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌─ personas.js: generatePersonas() ─────────────────────────┐  │
│  │  Seeds personas from domain pool (heuristic traits),      │  │
│  │  applies personaTweaks (riskBias, evidenceDemand, etc.)   │  │
│  │  Assigns cluster (skeptical/expansive/balanced)           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌─ manifest.js: buildBranches() ────────────────────────────┐  │
│  │  Heuristic fallback strategy generator                    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌─ generative.js (parallel) ────────────────────────────────┐  │
│  │  proposeGenerativeBranches()  — LLM creates branchCount   │  │
│  │    strategies with upside/risks/conditions/counterfactuals │  │
│  │    [~2*branchCount calls, diversity enforced by embedding] │  │
│  │  proposeGenerativePersonas()  — LLM creates distinct      │  │
│  │    personas with traits mapped from descriptions          │  │
│  │    [personaCount calls]                                   │  │
│  │  generateCustomPersonaFromDescription() — for custom      │  │
│  │    personas if provided [parallel calls]                  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌─ generative.js: proposeGenerativeReactions() ────────────┐  │
│  │  Per persona, per branch: LLM evaluates as advisor        │  │
│  │  [personaCount * branchCount calls]                       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌─ generative.js: conductCrossExamination() ───────────────┐  │
│  │  Judge poses question, persona commits to final stance    │  │
│  │  [personaCount calls]                                     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌─ scoring.js: scoreBranches() ────────────────────────────┐  │
│  │  Weighted formula: evidence*1.2 + risk*1.1 + clarity*0.8 │  │
│  │  + contradiction*1.3 + personaFit*1.0                    │  │
│  │  Computes: evidenceBonus, personaBonus, clarityBonus,    │  │
│  │  penaltyLoad, contradictionPenalty. Final score clamped  │  │
│  │  [0,100]. Confidence from support/pushback/risk counts.  │  │
│  │  Ranks: best/runner-up/weakest/alternate.                │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  └─ generative.js ───────────────────────────────────────────┐  │
│     generateExecutiveBrief() — strategic directive + vuln    │  │
│     generateCounterfactuals() — stress-test each branch      │  │
│     [branchCount + 2 calls]                                 │  │
│     Total: ~4 + 2b + 2p + pb LLM calls (b=branches,p=ppl)  │  │
│     Default 4x4: ~42 calls per simulation                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────┐
│  Save state → user_runs, saveRoundSummary   │
│  → memtrace_rounds, orchestrator.ingest()   │
└─────────────────────────────────────────────┘
```

---

### Mesh Mode — Social Dynamics & Belief Contagion

Multi-round social simulation: agents with persistent belief states publish posts, react to shocks, form edges, and defect between factions. Uses a strict 1:9 archetype-to-domain-persona ratio.

```
POST /api/v4/simulate/mesh
         │
         ▼
┌─────────────────────────────────────────────┐
│  mesh_server.js                              │
│  • checkInjectionGuardrail()                 │
│  • getUser() → token forecast                │
│  • queue.enqueue() → returns { jobId }       │
└────────────────────┬────────────────────────┘
                     │ background job
                     ▼
┌─────────────────────────────────────────────┐
│  simulator.js  — simulateMesh()             │
│                                             │
│  simId = randomUUID()                       │
│  generative.js: determineDomainAndAudience()│
│  memtrace_mesh.js: normalizeMemTraceDomain()│
│  agent_memory.js: createSimulation()        │
│  evidence.js: buildEvidenceProfile()        │
│  knowledge_graph.js: buildScenarioGraph()   │
│  generative.js: proposeGenerativeBranches() │
└────────────────────┬────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  mesh.js: generateMesh()                                         │
│  • extractTopics(scenario, graph) — 3 strategies (graph-based,   │
│    semantic embedding cosine, word frequency)                    │
│  • Partition PSEUDO_ARCHETYPES (16 meta-types) from domain       │
│    SPECIFIC_DOMAINS pool                                         │
│  • Assemble pool with 1:9 ratio — every 10th agent is a         │
│    pseudo-archetype, rest are domain-specific                    │
│  • Platform rotation: weighted shuffle across 6 platforms        │
│    (twitter:3, reddit:3, hn:2, discord:2, market:2, facebook:3) │
│  • per agent: createBeliefState(topics), traits with jitter,     │
│    clusterFromPersona(), focusNodeIds, localNeighborhood         │
└────────────────────┬──────────────────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  memtrace_engine.js  — simulateMemTraceMesh()                    │
│                                                                  │
│  ROUND LOOP [1..maxRounds]:                                      │
│  ─────────────────────────────────────────────                   │
│                                                                  │
│  Tick %3 != 1:                                                   │
│  ┌─ generateUnexpectedShock() ────────────────────────────────┐  │
│  │  shocks.js: getRandomShock(domain, polarity) — weighted     │  │
│  │  random from 40 shocks per domain (20 pos + 20 neg)        │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─ knowledge_graph.js: applyShockToGraph() ──────────────────┐  │
│  │  Destabilizes matching node, stresses same-type, marks     │  │
│  │  attached edges as DISRUPTED                                │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ tick_engine.js: runTick() ────────────────────────────────┐  │
│  │  Per tick:                                                  │  │
│  │  1. Generate posts — batch LLM call (concurrency 5), each  │  │
│  │     agent writes numPostsPerAgent posts via _generatePost() │  │
│  │     mesh.js: buildAgentSystemPrompt() provides persona      │  │
│  │  2. Interaction cycles — for each cycle, build pairwise    │  │
│  │     pairs (observer → poster), LLM classifies action       │  │
│  │     likelihood via _classifyActionLikelihood():             │  │
│  │     {like, comment, follow, ignore} → weighted sample      │  │
│  │  3. _generateWritingActionContent() — LLM writes comment   │  │
│  │     /reply in character                                    │  │
│  │  4. _scoreEdgeSentiment() — LLM zero-shot: {sentiment,    │  │
│  │     intensity, agrees} with 3-tier fallback (LLM → lexical │  │
│  │     → Xenova embedding cosine)                             │  │
│  │  5. _applyBeliefNudges() — for each agent, collect         │  │
│  │     observations, call belief_state.js: nudgeBeliefs()     │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ belief_state.js ──────────────────────────────────────────┐  │
│  │  nudgeBeliefs(beliefs, observations):                       │  │
│  │  • Per-agent learning rate = BASE_LR * (0.5 + novelty*0.8) │  │
│  │    * (1.2 - clarityNeed*0.4)                               │  │
│  │  • Echo chamber damping: same-faction signals cap at 0.7   │  │
│  │  • Position delta = (authorStance - currentPos) * postWt   │  │
│  │    * effectiveLR / resistance                              │  │
│  │  • Resistance = 1 + 3*confidence + 2*clarityNeed           │  │
│  │  • Confidence: opposition erodes 0.05, agreement boosts    │  │
│  │  • Trust: like/follow +0.08, disagree -0.05                │  │
│  │                                                            │  │
│  │  applyCascadeTippingPoints(): if >=40% agents <= -0.5 on   │  │
│  │  topic → panic collapse to -0.9. If >=40% >= +0.5 → viral │  │
│  │  surge to +0.9. Both lock confidence at 0.99.              │  │
│  │                                                            │  │
│  │  evaluateDynamicFactionTipping(): LLM decides if agent     │  │
│  │  defects faction (triggered when avg confidence < 0.55 or  │  │
│  │  random 15% per round)                                    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ memtrace_engine.js: synthesizeRoundSummary() ────────────┐  │
│  │  [1 LLM call] Compresses all events into dense paragraph   │  │
│  │  _extractContestedClaim() [1 LLM call] extraction          │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ agent_memory.js: saveRoundSummary() ─────────────────────┐  │
│  │  Persists round to memtrace_rounds table                   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ orchestrator.ingest() ───────────────────────────────────┐  │
│  │  Round summary ingested into MemTrace vector store         │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
└────────────────────┬──────────────────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  POST-ROUND:                                                     │
│  ┌─ interview.js: conductInterviews() ───────────────────────┐   │
│  │  ReporterAgent Q&A with selected agents                    │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ report_generator.js: generateReport() ───────────────────┐   │
│  │  _computeConsensus() — per-topic avgPosition, polarization │   │
│  │  _computeInfluence() — reaction-weighted influence scores  │   │
│  │  _computeShifters() — belief delta magnitude ranking       │   │
│  │  _computeVerdict() — weighted by DOMAIN_POWER_MULTIPLIERS │   │
│  │    → stance (go/abort/deadlock/leaning), LLM synthesis    │   │
│  │  _extractTopThreads() — most-replied posts                │   │
│  │  _extractHashtagsAndPhrases() — real hashtags + keywords  │   │
│  │  _buildDailySpeakerTimeline() — per-day speaking events   │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  agent_memory.js: completeSimulation()                            │
│  plus relational edge calculation between all agent pairs         │
└───────────────────────────────────────────────────────────────────┘
```

---

### Tree Mode — MCTS with Deterministic Physics

Transforms subjective LLM planning into a mathematical Monte Carlo Tree Search. LLM handles soft tasks (state encoding, operator generation, utility scoring), while a deterministic physics engine computes state transitions.

```
POST /api/v4/simulate/tree
         │
         ▼
┌─────────────────────────────────────────────┐
│  tree_server.js                              │
│  • checkInjectionGuardrail()                 │
│  • getUser() → token forecast                │
│  • Phase 1: Decision Space Adaptation        │
└────────────────────┬────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  PHASE 1 — Decision Space Adaptation                             │
│                                                                  │
│  generative.js: determineDomainAndAudience() [1 LLM call]        │
│  domain_matcher.js: normalizeToBranchDomain()                    │
│  ontology.js: getDomainOntology() — loads base ontology with     │
│    variable definitions (min/max/defaultValue), operator         │
│    definitions (base_effects/dynamic_effects with elasticity     │
│    models), stakeholder definitions (with weights), interaction  │
│    coefficients (with coupling strengths)                       │
│                                                                  │
│  query_adapter.js: generateDecisionSpace() [1 LLM call]         │
│    Enriches ontology with query-specific variables/operators/    │
│    stakeholders. Base ontology always wins on collision.         │
└────────────────────┬──────────────────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  PHASE 2 — Tree Building (tree_builder.js: buildTree())          │
│                                                                  │
│  ┌─ state_encoder.js: encodeInitialState() ─────────────────┐   │
│  │  [1 LLM call] Produces S_0: bounded numeric values for   │   │
│  │  each variable with reason + confidence. Returns node    │   │
│  │  with variables, inferences, probability=1.0, depth=0   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─ utility_scorer.js: scoreStateUtilities() ───────────────┐   │
│  │  [1 LLM call] Maps state to stakeholder utility scores   │   │
│  │  [-1.0, 1.0], computes weightedMean using stakeholder    │   │
│  │  weights. Stores .utilities and .utility_scalar          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─ tree_builder.js: computeStateInstability() ─────────────┐   │
│  │  Measures variable divergence from defaults, weighted by  │   │
│  │  coupling coefficients → influences variance amplification│   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  BFS LOOP (queue-driven, maxDepth, prune < 0.001):              │
│  ────────────────────────────────────────                       │
│                              │                                   │
│  ┌─ operator_generator.js: generateOperators() ────────────┐   │
│  │  [~branchingFactor*2 LLM calls] Produces action labels  │   │
│  │  Semantic projection: embed labels → cosine similarity  │   │
│  │  → softmax against ontology operators → projected_weights│   │
│  │  Diversity enforced by embedding deduplication          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─ perturbation_engine.js: injectPerturbations() ─────────┐   │
│  │  15% chance: replaces last operator with random shock    │   │
│  │  from SHOCK_REGISTRY (getRandomShock)                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─ tree_builder.js: clusterAndDiversifyOperators() ───────┐   │
│  │  Embedding clustering (cosine threshold 0.82), round-    │   │
│  │  robin selection for diverse operator set                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  For each operator:                                              │
│  ┌─ transition_engine.js: calculateTransition() ────────────┐   │
│  │  100% DETERMINISTIC:                                      │   │
│  │  S_{t+1} = S_t + Δ_elastic + Δ_noise + Δ_cascade        │   │
│  │                                                            │   │
│  │  Step 1 — Base effects: iterate projected_weights, look   │   │
│  │    up base_effects, call elasticity.js:                   │   │
│  │    computeElasticDelta(value, magnitude, model, min, max) │   │
│  │    Models: "flat" = magnitude, "inverse" = amplified      │   │
│  │    against current position, "proportional" = scales with │   │
│  │    current level                                          │   │
│  │                                                            │   │
│  │  Step 2 — Shock variance: if shock operator, amplify      │   │
│  │    variance, apply polarity-based extra delta             │   │
│  │                                                            │   │
│  │  Step 3 — Gaussian noise: Box-Muller sampled noise with   │   │
│  │    base variance 0.01, amplified by instability & shock   │   │
│  │                                                            │   │
│  │  Step 4 — Causal interactions: cross-variable deltas      │   │
│  │    using ontology interaction coefficients                │   │
│  │                                                            │   │
│  │  Step 5 — Clamp to [min, max] per variable                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─ estimation_engine.js: estimateDynamicParameters() ─────┐   │
│  │  For variables with dynamic_effects only: LLM estimates  │   │
│  │  {mean: [-1,1], variance: [0,0.5]}. Cached via embedding │   │
│  │  similarity (threshold 0.88)                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─ utility_scorer.js: scoreStateUtilities() ───────────────┐   │
│  │  [1 LLM call per child] Stakeholder utility evaluation   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─ probability_engine.js: computeProbabilities() ──────────┐   │
│  │  Regret-minimization + softmax:                          │   │
│  │  Per sibling: regret = sum(max(0, v_other - v_self))     │   │
│  │  Logits = -regret, softmax(temp=1.5)                     │   │
│  │  Sets .probability, .expected_utility, .regret           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─ tree_builder.js: DAG Merge ────────────────────────────┐   │
│  │  If causal-state-distance < 0.05 AND operator-edit-dist  │   │
│  │  <= 2 AND expected-variable-distance < 0.05:             │   │
│  │  → Merge: weighted avg variables, sum path_probability,  │   │
│  │    redirect edge. Flag semantic_collision_risk if        │   │
│  │    utility-distance > 0.20                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─ tree_builder.js: computeBestPath() ─────────────────────┐   │
│  │  Greedy DFS maximizing cumulative expected utility        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─ tree_builder.js: computeRiskProfile() ──────────────────┐   │
│  │  Leaf utility variance + tail risk ratio                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────┬──────────────────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  PHASE 3 — Dominant Futures                                       │
│                                                                  │
│  query_adapter.js: extractDominantPaths(tree, rootId, 3)         │
│    DFS top 3 leaf paths by cumulative expected utility           │
│                                                                  │
│  query_adapter.js: explainDominantFutures() [1 LLM call]         │
│    FutureNarrativeComposer translates math to narrative cards    │
│    → title, probability_label, outcome, main_risk, main_upside,  │
│      signal, action, sentiment. Diversity enforced at 0.84.     │
│    Dynamic fallback if LLM fails (mathematically grounded).      │
│                                                                  │
│  agent_memory.js: saveTreeSimulation()                           │
└──────────────────────────────────────────────────────────────────┘
```

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
