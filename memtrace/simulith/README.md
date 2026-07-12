# Decision Engine Core (Council V4)

This directory houses the **Decision Engine**, the primary intelligence layer of MemTrace. It has evolved from a simple heuristic simulator into an **Outcome-Trained** platform that grounds its logic in specific evidence.

## Core Features
- **Evidence Grounding**: Every branch recommendation is linked to specific facts and sources via unique IDs.
- **Outcome Learning**: The engine learns from real-world outcomes. Domain statistics (wins/losses) influence future scoring weights.
- **Persona Reliability**: Personas track their own "reliability" based on how often their stances align with actual outcomes.
- **Dynamic Reclustering**: Persona traits surgically adapt based on historical predictive accuracy.

## Project Structure
```text
simulith/
├── data/                  # Simulation database & assets
├── models/                # Local GGUF models
├── src/                   # Core source files
│   ├── ai.js              # LLM wrapper & completion provider
│   ├── agent_memory.js    # Simulation state persistence
│   ├── evidence.js        # Grounding & fact mapping
│   ├── generative.js      # Dynamic persona/branch generation
│   ├── interview.js       # Interview simulation workflow
│   ├── manifest.js        # Central source of truth for domains/archetypes/branches
│   ├── memtrace_mesh.js  # Normalization & embedding mapping
│   ├── personas.js        # Trait modeling & reliability
│   ├── queue.js           # Async simulation queues
│   ├── report_generator.js# Executive briefs
│   ├── scoring.js         # Evidence-based scoring
│   ├── simulator.js       # Mesh orchestrator
│   ├── store.js           # Statistics persistence
│   ├── mesh.js           # Cognitive mesh generation
│   └── tick_engine.js     # Simulation clock
├── output_log.md          # Execution log (Rule 9)
├── project_report.md      # Developer/Agent technical report
├── package.json           # Project dependencies
├── server.js              # Simulation backend server
└── test_headless.js       # Command-line simulation runner
```

## Testing & Validation
To test domain classification:
```bash
node /home/azeez/.gemini/antigravity/brain/70f1c0d9-6647-46bb-96dc-90bba8a3e5e1/scratch/test_domains.js
```

To run a headless simulation:
```bash
node test_headless.js
```
