# Architecture Diagrams

This document contains detailed architectural flows and mathematical formulations for Simulith's core systems.

---

## 1. Mesh Mode Architecture

**TL;DR**: Mesh mode simulates how narratives and beliefs propagate through a social network. It generates autonomous agents with starting beliefs, introduces a scenario (narrative shock), and computes how beliefs drift and factions form based on logistic defection probabilities.

### 🧮 Formulations:

* **Belief Update Logic**:
  $$
  \Delta \text{position} = \frac{(\text{authorStance} - \text{currentPos}) \times \text{postWeight}}{\text{resistance}}
  $$
* **Logistic Defection Probability**:
  $$
  P(\text{defect}) = \sigma(\Delta U \times \text{temperature})
  $$

### 👤 Custom Persona Integration:

Mesh mode accepts custom user-defined personas. When a custom description is provided, it is parsed by Qwen into a structured archetype, assigned a platform focus, and injected directly into the network seed pool. This custom agent then posts, interacts, and updates its beliefs dynamically based on the network's narrative shocks.

### 📈 Processing Flow:

```mermaid
flowchart TD
    A[Enriched Input] --> B[Initialize Network Graph]
    B --> C[Generate Personas via Qwen3.7-plus]
  
    subgraph mesh_core [Mesh Processing Engine]
        C --> D[Tick 0: Initial State]
        D --> E{Simulation Loop}
        E --> F[Agents Observe Posts]
        F --> G[Compute Utility vs Current Faction]
        G --> H[Apply Logistic Defection Math]
        H --> I[Update Belief Positions]
        I --> J[Store State to ApsaraDB RDS]
        J --> E
    end
  
    E -->|Max Ticks Reached| K[Compute Final Faction Distribution]
    K --> L[Generate Mesh Output Report]
  
    %% Fact Injection
    M[(Knowledge Graph Data)] -.-> F
```

---

## 2. Council Mode Architecture

**TL;DR**: Council mode creates an expert panel of diverse AI personas (e.g., Skeptic, Optimist, Regulator) to debate a user's scenario. They argue, rebut, and ultimately converge on a weighted confidence score.

### 🧮 Formulations:

* **Confidence Scoring**:

  $$
  C_b = \text{clamp}(\text{confidenceBase} + \text{support} \times 4 - \text{risk} \times 3 + \text{supportCount} \times 6 - \text{pushbackCount} \times 6 - \text{contradictions} \times 2, 5, 95)
  $$

  *(where $C_b$ is the confidence index of strategic branch $b$, penalizing contradictions and pushbacks while rewarded by structured supports)*

### 👤 Custom Persona Integration:

Council mode fully integrates custom personas. The user's unstructured role description is mapped by Qwen into numeric trait parameters: `riskBias` (inverse of tolerance), `evidenceDemand`, `noveltySeek` (derived from risk and evidence requirements), and `clarityNeed` (derived from evidence demand and reasoning style). These traits explicitly govern the persona's debate bias, prompting them to support or push back against strategic alternatives during cross-examination.

### 📈 Processing Flow:

```mermaid
flowchart TD
    A[Enriched Input] --> B[Persona Generation Matrix]
    B --> C[Fetch Similar Past Scenarios via Qwen Embedding]
  
    subgraph council_core [Council Processing Engine]
        C --> D[Instantiate Persona Agents]
        D --> E[Round 1: Opening Statements]
        E --> F[Round 2: Rebuttals & Conflict Analysis]
        F --> G[Round 3: Final Convergence]
    
        G --> H[Extract Argument Nodes]
        H --> I[Calculate Confidence Score]
    end
  
    I --> J[Store Council Report to ApsaraDB RDS]
    J --> K[Return Confidence Matrix Output]
  
    %% Qwen API
    E & F & G -.-> Q[Qwen3.7-plus Chat API]
```

---

## 3. Tree Mode Architecture

**TL;DR**: Tree mode explores the causal consequence cascade of a decision. It acts like an MCTS (Monte Carlo Tree Search), building a DAG (Directed Acyclic Graph) of what happens 1, 3, and 6 months down the line.

### 🧮 Formulations:

* **Stochastic Volatility Integration**:

  $$
  S_{t+1} = S_t + \Delta_{\text{elastic}}(S_t, O) + \Delta_{\text{sampled}}(\theta \sim \mathcal{N}(0, \sigma^2)) + \Delta_{\text{interaction}}
  $$
* **Minimax Regret Selection Probability**:

  $$
  p_i = \frac{\exp(\text{score}_i / \tau)}{\sum \exp(\text{score}_j / \tau)}
  $$

  *(where $\tau$ represents the exploration temperature controlling branching entropy)*

### 📈 Processing Flow:

```mermaid
flowchart TD
    A[Enriched Input] --> B[Root Node Creation]
    B --> C[Query Historical Analogues]
  
    subgraph tree_core [Tree Expansion Engine]
        C --> D[Generate 1-Month Primary Effects]
        D --> E[Inject Stochastic Volatility Noise]
        E --> F[Filter & Score Sibling Nodes]
        F --> G[Expand Highest Probability Nodes to 3-Months]
        G --> H[Repeat Expansion for 6-Months]
    end
  
    H --> I[Prune Low Probability Branches]
    I --> J[Calculate Cumulative Risk/Reward]
    J --> K[Construct Final Causal DAG]
    K --> L[Store to ApsaraDB RDS & Output]
  
    D & G -.-> Q[Qwen3.7-plus API]
```

---

## 4. Router & Divergence Architecture

**TL;DR**: The Orchestrator layer. The Router automatically parses the user's prompt to detect which simulation mode is best. The Divergence engine can run all three modes concurrently and synthesize their differing conclusions into a unified insight.

### 📈 Processing Flow:

```mermaid
flowchart TD
    A[Enriched Input] --> B[Epistemology Router]
    B --> C{Determine Execution Strategy}
  
    C -->|Single Mode| D[Direct Dispatch to Target Engine]
    C -->|Complex Query| E[Divergence Mode: Run All]
  
    subgraph divergence_engine [Divergence Execution]
        E --> F1[Spawn Mesh Job]
        E --> F2[Spawn Council Job]
        E --> F3[Spawn Tree Job]
    
        F1 & F2 & F3 --> G[Await Completion]
        G --> H[Cross-Mode Synthesis]
        H --> I[Highlight Epistemic Disagreements]
    end
  
    I --> J[Return Unified Divergence Output]
```

---

## 5. Request Flow (End-to-End)

**TL;DR**: The full lifecycle from client browser, through the Express API proxy, interacting with Qwen Cloud and the database layer.

```mermaid
sequenceDiagram
    participant User as User/Browser Extension
    participant API as Express API Server
    participant DB as ApsaraDB RDS Postgres
    participant QwenAuth as LLM Proxy
    participant Qwen as Qwen Cloud API

    %% Authentication
    rect rgb(240, 240, 240)
        Note over User, API: 1. Authentication Flow
        User->>API: POST /api/auth/google { token }
        API->>User: 200 OK { success, token } & (Sets auth_token Cookie)
    end

    %% Persistent Context Ingestion
    rect rgb(230, 240, 250)
        Note over User, DB: 2. Persistent Memory Ingestion (Chrome Extension / Documents)
        User->>API: POST /v1/ingest { text, url } (with JWT/Bearer Token)
        API->>QwenAuth: Request text chunk embeddings
        QwenAuth->>Qwen: POST /compatible-mode/v1/embeddings (qwen-embedding)
        Qwen->>QwenAuth: Vector embeddings returned
        QwenAuth->>API: 
        API->>DB: Store embeddings (pgvector) & construct Knowledge Graph entities
        API->>User: 200 OK { success: true }
    end

    %% Simulation Execution & Real-time Tool-Enrichment
    rect rgb(220, 250, 220)
        Note over User, Qwen: 3. Stress-Test Simulation & Real-time Agentic Enrichment
        User->>API: POST /api/v4/automation/router { question, facts }
        API->>API: Trigger enrichPayload()
        API->>QwenAuth: Classify tool need (ToolDecider)
        QwenAuth->>Qwen: Identify appropriate live sources
        API->>API: Execute Tool (Wikipedia / Binance / HN / CheckFacts)
        API->>API: Append enriched facts to scenario payload

        API->>API: Router Analysis (Select Council, Mesh, or Tree)
        API->>DB: Initialize Simulation State
        API->>User: 200 OK (Keep-Alive Stream Initialized)
    
        loop Every 2 seconds
            User->>API: GET /api/v4/automation/status (Poll Telemetry)
            API->>User: 200 OK { logs, automationState, llmCallCount }
        end
    
        API->>QwenAuth: Multi-agent prompt pipeline
        QwenAuth->>Qwen: POST /compatible-mode/v1/chat/completions (qwen3.7-plus)
        Qwen->>QwenAuth: Inference Output
        QwenAuth->>API: 
        API->>DB: Save Final Result & Compact to Knowledge Graph (pgvector)
        API->>User: Stream Complete & Return Output
    end
```

---

## 6. Memory Substrate (Graph RAG Engine)

**TL;DR**: The Memory Substrate functions as a production-grade Graph RAG system. It ingests unstructured text, chunks it, generates embeddings using `qwen-embedding`, extracts semantic entities and relationship nodes, and saves them to a relational knowledge graph.

### 🧮 Formulations:

* **Vector Semantic Retrieval**:

  $$
  \text{Similarity}(A, B) = \cos(\theta) = \frac{A \cdot B}{\|A\| \|B\|}
  $$

  *(used to match current queries against historical memory vectors)*

### 📈 Processing Flow:

```mermaid
flowchart TD
    A[Unstructured Ingestion Source] --> B[Text Splitter & Chunker]
    B --> C[Qwen Embedding Generator]
  
    subgraph graph_rag [Graph RAG Processing Pipeline]
        C --> D[pgvector Semantic Storage]
        B --> E[Named Entity Recognition & Tagging]
        E --> F[Link Extraction & Relation Scoring]
        F --> G[Ontology Knowledge Graph Builder]
    end
  
    G --> H[(ApsaraDB RDS PostgreSQL)]
    D --> H
  
    H -->|Graph-Augmented Retrieval| I[Context Injection for Simulation Engines]
```

---

## 7. Agentic Tool-Calling Pipeline

**TL;DR**: The decision engine employs a dynamic, multi-agent tool execution model where agents can autonomously decide to fetch live reality data or background encyclopedic/market references before generating simulation outputs.

### 📈 Processing Flow:

```mermaid
flowchart TD
    A["Raw User Input\n(text, URL, or file)"] --> B{"Tool Call\nEnrichment?"}
    B -->|Yes| C["Tool Decider Logic\n(Qwen: classify tool need)"]
    C --> D["Execute Selected Tool\n(Wikipedia | Binance | HN | check-facts)"]
    D --> E["Enriched Context Payload"]
    E --> F[Enriched Input]
    B -->|No| F
```
