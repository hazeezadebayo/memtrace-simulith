# 🧠 Simulith: Multi-Perspective Decision Stress-Testing Suite

**Stress-test your decisions through simulated expert councils, dynamic social networks, and causal future timelines. Powered by Qwen Cloud.**

**Built for the Alibaba Cloud Global AI Hackathon Series**

---

## 🚀 TL;DR

Simulith is a multi-perspective decision stress-testing suite. Instead of providing flat, general-purpose advice, Simulith runs structured, multi-engine simulations to evaluate strategic, organizational, or personal choices. By converting active web page context or user prompts into three specialized simulation models—adversarial advisory debates, multi-platform opinion drift, and causal consequence cascades—Simulith exposes hidden risks, computes decision confidence indices, and projects future milestones *before* you commit.

Built entirely on **Qwen Cloud APIs (`qwen3.7-plus`, `qwen-embedding`)**, deployed on **Alibaba Cloud SAS**, and backed by **ApsaraDB RDS for PostgreSQL**.

---

## 🏗️ Multi-Engine Simulation Architecture

Simulith evaluates every decision scenario across three distinct engines, each providing a unique perspective:

1. **Council Mode (Expert Advisory Board):**
   Convenes a diverse board of stakeholder personas to debate alternatives. It runs an active, adversarial debate loop where an AI Judge cross-examines the personas on their biases, forcing them to justify their stances before calculating a decision confidence index.
2. **Mesh Mode (Dynamic Social Networks):**
   Spawns agents onto a relational social graph to map how opinions, trust, and faction alignments drift over time across simulated platforms (Twitter, Reddit, Hacker News, Discord) when exposed to unexpected narrative shocks.
3. **Tree Mode (Causal Future Timelines):**
   Projects compounding risks and causal milestones 1, 3, and 6 months out. It utilizes Monte Carlo Tree Search principles to build a Directed Acyclic Graph (DAG) of future states, applying stochastic volatility noise to simulate non-linear real-world environments.

### The Router & Divergence Engine

Simulith features an orchestration layer that automatically analyzes the query to dispatch it to the optimal simulation mode. Alternatively, it can execute all three engines concurrently (**Divergence Mode**), analyzing the divergence (conflict) between logical reasoning, social sentiment, and timeline projections to highlight potential blindspots.

---

## ⚙️ Core Innovations & Tech Stack

* **Active Browser Context Ingestion (Chrome Extension):** Instantly crawls and imports web articles, policy drafts, codebases, or news threads directly from your active browser tab to run simulations in seconds.
* **GraphRAG Memory Substrate:** Powered by **ApsaraDB RDS PostgreSQL with `pgvector`** and **Qwen-embedding**. It maps entities, relations, and past simulation outcomes, providing cross-simulation continuity so that historical decisions influence future agent behaviors.
* **Dynamic Persona Synthesis:** Custom advisor descriptions are mapped by Qwen into numeric profile traits (`riskBias`, `evidenceDemand`, `noveltySeek`, `clarityNeed`), governing how they argue and react during simulations.

---

### 🎯 Tracks Entered

| Track                     | Coverage                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MemoryAgent**     | Persistent, structured memory substrate: chunking → embedding (Qwen) → knowledge graph → cross-session recall. Every simulation outcome is ingested back for future queries.          |
| **Agent Society**   | Three multi-agent architectures (Council, Mesh, Tree) with autonomous agents that deliberate, factionalize, compete, and drift. Router/Divergence orchestrator coordinates across modes. |
| **Autopilot Agent** | Router auto-selects simulation mode from user intent. Divergence runs all three autonomously. End-to-end pipeline from ingestion to report with zero manual routing.                     |

---

## ✅ Qwen Hackathon Submission Checklist

| Requirement                                 | Status | Details                                                                                                                                                                                                                                                         |
| :------------------------------------------ | :----: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Repository URL**                    |   ✅   | [https://github.com/hazeezadebayo/memtrace-simulith](https://github.com/hazeezadebayo/memtrace-simulith)                                                                                                                                                         |
| **Code, Assets, & Instructions**      |   ✅   | **This repository contains all necessary source code, assets, and instructions required for the project to be functional.** See the Quick Start section below for full instructions on running the code via Bash, Docker, or accessing the live web link. |
| **Open Source License**               |   ✅   | Released under the**MIT License**. The `LICENSE` file is located at the root of the repository, ensuring it is automatically detectable and visible in the GitHub "About" section as required by the judges.                                            |
| **1–3 Minute Video Demo**            |   ✅   | Watch the demo:[https://www.youtube.com/watch?v=UzUKtVRFGIM](https://www.youtube.com/watch?v=UzUKtVRFGIM)                                                                                                                                                                                                                |
| **Architecture Diagram**              |   ✅   | Detailed flowcharts for all engines:[architecture_diagram.md](./architecture_diagram.md)                                                                                                                                                                         |
| **Written Summary**                   |   ✅   | This document serves as the comprehensive summary of features and functionality.                                                                                                                                                                                |
| **Proof of Alibaba Cloud Deployment** |   ✅   | See screenshots below verifying the Alibaba SAS dashboard and active environment.                                                                                                                                                                               |

### Proof of Alibaba Cloud Deployment

Deployed on Alibaba Cloud Simple Application Server (SAS) in the Singapore region via Cloudflare Tunnel. The $40 hackathon coupon funded 6 months of hosting.

![Alibaba Cloud Deployment Proof 1](alibaba_proof1.png)
![Alibaba Cloud Deployment Proof 2](alibaba_proof2.png)

---

## 🏆 Judging Criteria Mapping

### 1. Problem Value & Impact (25%)

**Real-World Relevance:** Decision paralysis and unforeseen consequences cost businesses and individuals heavily. Simulith solves this universal pain point by converting raw "what-if" anxiety into structured, mathematical foresight.
**Scalability Potential:** Simulith is engineered for enterprise-grade productization. The stateless Node.js architecture scales horizontally via Docker, while long-term memory is powered by Turso, with option for an Alibaba ApsaraDB RDS PostgreSQL cluster with `pgvector`, allowing infinite retention of past simulation outcomes for cross-session organizational memory.

### 2. Technical Depth & Engineering (30%)

Simulith demonstrates sophisticated engineering and architectural depth:

* **Qwen3.7-plus & Qwen-embedding Integration:** Powering all multi-agent reasoning, semantic GraphRAG chunking, and memory substrate persistence.
* **Agentic Tool Calling (ToolDecider & Registry):** Agents dynamically query external reality using a custom-built tool selection pipeline. Supported tools include:
  * **WikipediaTool:** Fetches encyclopedic context and historical precedents to back up claims.
  * **BinanceTool:** Imports real-time token metrics (tickers, prices, volumes) for real-world financial tracking.
  * **HnTrendsTool:** Scrapes Hacker News discussions for instant developer sentiment and community trends.
  * **CheckFactsTool:** A recursive fact-verification agent loop validating claims made during simulations.
* **Production-Grade Security & Isolation:**
  * **Cross-User Data Isolation:** Complete logical isolation separating user simulations, history, and persona profiles.
  * **Strict CSRF & Request Verification:** Origin-enforcing middleware blocking unauthorized cross-origin state modifications.
  * **Secure JWT-Based Authentication:** Cookie-based session security protecting user profiles and simulation execution endpoints.
  * **Role-Based Access Control (RBAC):** Restricting critical system metrics and management APIs to verified admin sessions.
* **Alibaba Cloud Infrastructure Integration:**
  * **Alibaba Cloud SAS:** Serves as the primary host for the stateless Node.js runtime and Express orchestrator.
  * **ApsaraDB RDS for PostgreSQL:** Incorporates `pgvector` for low-latency similarity search, supporting horizontal scaling.
* **Algorithmic Constraint Systems:** The simulation is guided by mathematically rigid constraints (logistic defection curves, Gaussian noise, and Monte Carlo Tree Search branch expansion) rather than unconstrained generative outputs.

### 3. Innovation & AI Creativity (30%)

* **Architectural Excellence:** Simulith is built with strict modularity, cleanly separating the Express API orchestration layer from the specialized `Council`, `Mesh`, and `Tree` engines.
* **Epistemic Divergence Engine:** A highly creative implementation that doesn't just run one simulation, but runs three orthogonal models and algorithmically synthesizes the *friction* between them.
* **AI Judge Cross-Examination:** Instead of a passive swarm, our custom logic forces LLM personas into structured adversarial debates governed by dynamic evidence and novelty thresholds.

### 4. Presentation & Documentation (15%)

* **Comprehensive Visualizations:** The accompanying `architecture_diagram.md` provides 6 detailed Mermaid flowcharts mapping every subsystem, from GraphRAG injection to MCTS expansion.
* **Live Demo:** The submission includes a clear, narrated video demo showcasing the end-to-end pipeline and immediate UI reactivity.

---

## 🎯 What Can Simulith Do?

| You Ask                                            | Simulith Shows You                                                                                                                                                  |
| :------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **"Should I start that YouTube channel?"**   | A**Council** debate between Creator, Skeptic, and Audience personas. A **Tree** map of the 6-month consequence cascade.                                 |
| **"Is my boss gaslighting me?"**             | **Council** panel evaluates your evidence and returns a manipulation probability index.                                                                       |
| **"Will this new company policy backfire?"** | **Mesh** mode simulates belief drift across 6 months—how values, trust, and conflict patterns evolve between employee personas through 50 interaction ticks. |
| **"Is this crypto token a pump-and-dump?"**  | **Tree** traces the consequence DAG. **Council** simulates a panel of Regulator, Trader, and HODLer personas.                                           |

---

## ⚡ Complete Setup & Execution Guide (Quick Start)

The repository contains everything needed to evaluate and run the project end-to-end.

### Method 1: Access the Live Web App (Easiest)

You can evaluate the fully deployed application running on Alibaba Cloud immediately:
🌐 **Live URL**: [simulith.hazeezadebayo.dev](https://simulith.hazeezadebayo.dev)

### Method 2: Local Bash Execution (Development)

To run the source code directly on your local machine:

```bash
# 1. Clone the repository and cd into the working directory
git clone https://github.com/hazeezadebayo/memtrace-simulith.git
cd memtrace-simulith/memtrace

# 2. Install Node.js dependencies
npm install

# 3. Configure environment variables (Required)
export API_KEY="sk-your-qwen-api-key"
export DATABASE_URL="postgresql://user:pass@your-apsaradb-rds-endpoint:5432/memtrace"

# 4. Start the Express API server and background orchestrator
npm run dev
```

*The server will boot at `http://localhost:3106`.*

### Method 3: Simplified Docker Execution (Recommended)

For convenience, a unified lifecycle management script is provided at the root of the repository to handle configuration, container building, deployment, and health monitoring in a single command:

```bash
# 1. Clone the repository and navigate to the root directory
git clone https://github.com/hazeezadebayo/memtrace-simulith.git
cd memtrace-simulith

# 2. Configure your credentials (optional: cp .env.example memtrace_cicd/.env and edit)
export API_KEY="sk-your-qwen-api-key"

# 3. Start the stack (automatically initializes env, builds, and launches)
./run_memtrace.sh up
```

*This script automatically configures the environment, builds/starts all containers in the background, waits for the health check to pass, and outputs live validation curl tests. You can access the UI immediately at `http://localhost:3000/simulith/landing.html`.*

To shut down and clean up the containers:

```bash
./run_memtrace.sh clean
```

### Method 4: Manual Docker Deployment (Production)

If you prefer to build and deploy the production Docker image manually:

```bash
# 1. Navigate to the root directory
cd memtrace-simulith

# 2. Build the production image
docker build -f docker/Dockerfile.prod -t memtrace .

# 3. Run the container
docker run -d \
  --name memtrace \
  -p 3106:3106 \
  -e API_KEY="sk-your-qwen-api-key" \
  -v memtrace_data:/app/data \
  memtrace
```

### ⚙️ Engine Customization & Configuration (`config.js` & `.env`)

Simulith is designed for deployment flexibility. The central configuration resides in `extension/env/config.js` and can be dynamically customized using host environment variables or a local `.env` file:

* **Flexible AI Engines (`LLM_PROVIDER` & `EMB_PROVIDER`):**
  * **Local/Offline Inference:** Set `LLM_PROVIDER=localllm` to run GGUF models (e.g. `DeepSeek-R1-Distill-Qwen-7B-Q4`, `Qwen3.5-4B-Q4`, `Phi-4-mini-instruct-Q4`) entirely on-device via WebAssembly/Wllama.
  * **Local Embeddings:** Set `EMB_PROVIDER=xenova` to compute vector embeddings locally using the ONNX-optimized `all-MiniLM-L6-v2` model.
  * **Hardware Acceleration:** Set `USE_WEBGPU=true` to enable WebGPU acceleration for local model and embedding execution.
  * **Cloud Scaling:** Supports Qwen Cloud (`qwen`), Google Gemini (`gemini`), and OpenAI (`openai`).
* **Database Portability (`DB_TYPE` & `ONLINE_DB_PROVIDER`):**
  * **Local/Zero-Infra Mode:** Set `DB_TYPE=offline` to direct simulations and GraphRAG relations to a local SQLite database (`data/memtrace.sqlite`), removing external cloud dependencies.
  * **Cloud Production Mode:** Set `DB_TYPE=online` to scale out. Supported database backends include Alibaba ApsaraDB RDS for PostgreSQL (`alibaba` / `postgres`) and remote edge SQL (`turso`).
* **Simulation DNA Tuning:** Adjust the mathematical coefficients of agent behavior directly in your environment:
  * `SIM_WEIGHT_EVIDENCE`: Multiplier for how much hard sources sway belief (default: `1.2`).
  * `SIM_WEIGHT_RISK`: Multiplier for how much perceived risk deters agent action (default: `1.1`).
  * `SIM_DRIFT_FRAG`: Social threshold where network opinions split into echo chambers (default: `0.45`).
  * `MT_AGENT_COUNT`: Total active agent population in simulated network meshes (default: `15`).

---

**License**: MIT
**Repository**: [github.com/hazeezadebayo/memtrace-simulith](https://github.com/hazeezadebayo/memtrace-simulith)
