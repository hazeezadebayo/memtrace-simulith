# **Memtrace AI**  
*Turn endless AI chats into searchable, structured, and intelligent knowledge.*

---

## **What is Memtrace AI?**

**Memtrace AI** is a **privacy-first Chrome extension** that captures, organizes, and connects long AI conversations (from Grok, ChatGPT, Copilot, etc.) into a **queryable knowledge graph**.

It solves the #1 pain point in AI workflows:  
> *“I just had a 3-hour coding session with AI… now I need to start over in another tool.”*

**Memtrace lets you copy entire AI threads — with full context — in chunks between platforms**, without re-explaining anything.

---

## **Core Idea**

> **One conversation. Many platforms. Zero repetition.**

You talk to **Grok** → save → search → paste into **ChatGPT** → continue.  
No copy-paste hell. No context loss. No re-explaining.

---

## **Key Features**

| Feature | Description |
|-------|-----------|
| **Intelligent Chunking** | ~5,000 words per chunk. No mid-sentence breaks. LLM-refined boundaries. |
| **LLM Summaries** | 150–200 word summaries per chunk (Gemini / OpenAI / Local Qwen3) |
| **Semantic Search** | Graph-powered. Finds related ideas even if not exact match. |
| **One Answer, Not 10 Chunks** | AI reads top results → gives **one clear answer**. |
| **Cross-Platform Copy/Paste** | Copy a chunk from Grok → paste into ChatGPT. |
| **Per-Device Sync (UUID)** | Your threads stay on your device. No cloud. |
| **Offline Mode** | Full summarization & search with **local Qwen3** (via FastAPI). |
| **Graph Intelligence** | Chunks linked by similarity. Search follows **semantic paths** with embeddings from [Xenova](https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/main). |
| **Token-Aware Context** | Never exceeds LLM token limits. Smart truncation. |

---

## **Folder Structure**

```
memtrace/
├── api/                       ← API Server & Backend Logic
│   ├── server.js              ← Express Server Entry
│   └── auth.js                ← Authentication Middleware
├── docker/                    ← Containerization Configs
├── extension/                 ← Chrome Extension Source
│   ├── background.js          ← Service Worker
│   ├── content.js             ← Page Content Script
│   ├── popup.js               ← UI Orchestration
│   ├── popup.html             ← Extension UI
│   ├── core/                  ← Core Application Logic
│   │   ├── orchestrator.js    ← The "Brain" (Pipeline Management)
│   │   ├── chunker.js         ← Smart Chunking Logic
│   │   ├── llm_agent.js       ← Summarization & Tagging
│   │   └── memory.js          ← Memory Management
│   ├── db/                    ← Database Adapters
│   │   ├── abstraction.js     ← Storage Interface
│   │   ├── sqlite-adapter.js  ← Local SQLite WASM
│   │   └── postgres-adapter.js← Remote PostgreSQL
│   ├── llm/                   ← Local Inference
│   │   └── offline_llm.js     ← In-browser LLM via Wasm
│   └── utils/                 ← Transformers.js & Assets
├── md/                        ← Documentation
├── test/                      ← Test Suite (Jest + E2E)
├── data/memtrace.sqlite            ← Local Database (Dev)
└── package.json               ← Project Dependencies
```

---

### `memtrace.json` — Your Knowledge Graph

```json
[
  {
    "uuid": "USER_DEVICE_UUID_1",
    "references": [
      {
        "reference": "https://chatgpt.com/c/thread-1",
        "timestamp": "2025-11-01T10:00:00.000Z",
        "reference_tags": [
          { "tag": "react", "count": 2, "score": 0.66 },
          { "tag": "hooks", "count": 1, "score": 0.33 }
        ],
        "total_chunk_count": 2,
        "chunks": [
          {
            "index": 1,
            "chunk": "User: How do I use useEffect? ...",
            "chunk_word_count": 500,
            "estimated_token": 125,
            "summary": "Explanation of useEffect dependency array...",
            "chunk_tags": ["react", "hooks"],
            "embedding": [0.1, 0.2, ...],
            "edge_list": [
              { "node_ref": "USER_DEVICE_UUID_1:TIMESTAMP:2", "score": 0.85 }
            ]
          },
          {
            "index": 2,
            "chunk": "User: What about cleanup functions? ...",
            "chunk_word_count": 600,
            "estimated_token": 150,
            "summary": "Details on returning cleanup function...",
            "chunk_tags": ["react", "lifecycle"],
            "embedding": [0.15, 0.25, ...],
            "edge_list": [
               { "node_ref": "USER_DEVICE_UUID_1:TIMESTAMP:1", "score": 0.85 }
            ]
          }
        ]
      },
      {
        "reference": "https://claude.ai/chat/thread-2",
        "timestamp": "2025-11-02T14:00:00.000Z",
        "reference_tags": [
          { "tag": "docker", "count": 2, "score": 0.66 },
          { "tag": "compose", "count": 1, "score": 0.33 }
        ],
        "total_chunk_count": 3,
        "chunks": [
          { "index": 1, "chunk": "...", "chunk_word_count": 400, "estimated_token": 100, "summary": "...", "chunk_tags": ["docker"], "embedding": [], "edge_list": [] },
          { "index": 2, "chunk": "...", "chunk_word_count": 400, "estimated_token": 100, "summary": "...", "chunk_tags": ["docker", "compose"], "embedding": [], "edge_list": [] },
          { "index": 3, "chunk": "...", "chunk_word_count": 400, "estimated_token": 100, "summary": "...", "chunk_tags": ["networking"], "embedding": [], "edge_list": [] }
        ]
      },
      {
        "reference": "https://grok.x.ai/thread-3",
        "timestamp": "2025-11-03T09:00:00.000Z",
        "reference_tags": [
           { "tag": "sql", "count": 2, "score": 0.5 }
        ],
        "total_chunk_count": 3,
        "chunks": [ /* 3 chunks content... */ ]
      }
    ]
  },
  {
    "uuid": "USER_DEVICE_UUID_2",
    "references": [
      /* Independent knowledge graph for User 2 */
      {
        "reference": "https://perplexity.ai/search/...",
        "timestamp": "2025-11-04T12:00:00.000Z",
        "reference_tags": [ { "tag": "python", "count": 4, "score": 1.0 } ],
        "total_chunk_count": 4,
        "chunks": [
          { "index": 1, "chunk": "...", "edge_list": [] },
          { "index": 2, "chunk": "...", "edge_list": [] },
          { "index": 3, "chunk": "...", "edge_list": [] },
          { "index": 4, "chunk": "...", "edge_list": [] }
        ]
      }
    ]
  }
]
```

### **Architecture Validation**
The system logic (`db/` + `Orchestrator`) is fully capable of replicating the above extraction because:
1.  **Multi-Tenancy**: The SQL schema (`chunks` table) is keyed by `uuid`. This allows multiple users (e.g., `USER_DEVICE_UUID_1` and `USER_DEVICE_UUID_2`) to coexist in the same database table without data leakage. `getAll(uuid)` strictly filters by this key.
2.  **Hierarchical Transformation**: While the DB stores flat chunks, the `Orchestrator.getThread(uuid)` method dynamically reconstructs the nested `Thread -> References -> Chunks` hierarchy on strict read-time. It groups by `url`, sorts by timestamp, and assigns indices `1..N` sequentially.
3.  **Aggregated Metadata**: `reference_tags` are not stored statically but are computed *live* by aggregating and weighting tags from all child chunks. This ensures the summary metadata is always consistent with the underlying data.
4.  **Graph Connectivity**: The `edge_list` specifically stores `node_ref` identifiers (e.g., `UUID:TIMESTAMP:INDEX`) and similarity `score`s, enabling the API to represent the graph edges exactly as defined in the schema.

This architecture decouples storage efficiency (flat SQL) from API contract (nested JSON), offering the best of both worlds.

> **Every chunk is searchable, connected, and copyable.**

---

## **Use Cases**

| Use Case | How Memtrace Helps |
|--------|---------------------|
| **Copy AI context** | Copy 3 chunks from Grok → paste into ChatGPT → continue |
| **Find old ideas** | “What did we say about VAD last week?” → one answer |
| **Debug long threads** | Jump to chunk #7 where the error started |
| **Offline research** | Summarize & search 100k words locally |
| **Build personal AI KB** | All your AI insights in one place |

---

## **Installation & Setup**

### **Option A: Chrome Extension (Local / Offline)**
*Best for most users. No coding required.*

1. **Clone or Download** the repository.
   ```bash
   git clone <repo-url> memtrace
   ```
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **"Load unpacked"**.
5. Select the `extension/` folder.
6. **Done!** The extension runs entirely in your browser using local storage (SQLite WASM).

---

### **Option B: Hybrid / API Server (Developer Mode)**
*Required if you want to use the HTTP API or sync to a central Postgres DB.*

1. **Install & Start Server**
   ```bash
   cd memtrace
   npm install
   npm start
   ``` 
   _(Server runs on port 3000)_

2. **Configure Extension (Optional)**
    *   If you want the extension to sync with this server, update `extension/env/config.js` to set `storage_mode: 'online'`.

---

## **How It Works (3 Tabs)**

| Tab | Purpose |
|-----|--------|
| **Summarizer** | Capture → Chunk → Summarize → Index |
| **Search** | Ask questions → Get one AI-synthesized answer |
| **Files** | Browse, copy, paste, delete threads per device |

### **1. Summarizer Tab**
1. Open any AI chat (Grok, ChatGPT, Claude) or article.
2. Click **"Summarize Page"**.
3. **Chunking**: Splits text at natural boundaries (no mid-thought cuts).
4. **Processing**: Summarizes and Tags each chunk via Gemini/OpenAI.
5. **Result**: See live preview of chunks and summaries. `threadlet.json` is updated.

### **2. Search Tab**
1. **Query**: Type a concept like `voice activity detection`.
2. **Search**: Click **Search**.
    *   **Tags**: Filters content by relevant keywords.
    *   **Embedding**: Finds top 10 semantically similar chunks.
    *   **Expansion**: traverse the graph (`edge_list`) to find connected ideas.
3. **Result**: You get **one synthesized answer** generated from the best context.
4. **Action**:
    *   Click **Copy** to grab the answer.
    *   Click **Img** to save the answer as an image.

### **3. Files Tab**
1. Enter your **Device UUID** (auto-generated).
2. Browse your saved threads.
3. **Copy/Paste**: Copy a chunk from one thread, paste it into another.
4. **Manage**: Delete old chunks or full threads to keep your KB clean.

---

### **4. Testing with Docker**

You can run the full test suite in a deterministic environment using Docker.

**Build the Image**
```bash
docker build -f docker/Dockerfile -t memtrace-api .
```

**Run API Tests** (Server & Endpoints)
```bash
# Requires setting API_KEY if running against a secured server
docker run --rm memtrace-api npm test -- test/api.test.js
```

**Run Extension UI Tests** (Popup Logic)
```bash
docker run --rm memtrace-api npm test -- test/popup.test.js
```

**Full E2E Suite via Docker Compose**
```bash
docker-compose up --build test-suite
```

---

## **API Usage (Developer Mode)**

The Memtrace Server (`npm start`) provides a full REST API for headless operation.

### **1. Ingest (Capture & Summarize)**
```bash
curl -X POST http://localhost:3000/v1/ingest \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{
    "uuid": "dev-device-1",
    "url": "http://example.com/article",
    "text": "Full text content here..."
  }'
```

### **2. Search (Vector + Graph)**
```bash
curl -X POST http://localhost:3000/v1/search \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{
    "query": "deployment strategies",
    "limit": 5
  }'
```

### **3. Chunk Management (CRUD)**

**Edit a Chunk**
```bash
curl -X PUT http://localhost:3000/v1/chunk/{CHUNK_ID} \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{ "text": "Updated text content..." }'
```

**Copy Chunk to another Thread**
```bash
curl -X POST http://localhost:3000/v1/chunk/{CHUNK_ID}/copy \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{ "targetUuid": "device-2", "targetUrl": "http://new-thread.com" }'
```

**Delete a Chunk**
```bash
curl -X DELETE http://localhost:3000/v1/chunk/{CHUNK_ID} \
  -H "x-api-key: your-key"
```

**Get Full Thread**
```bash
curl -X GET http://localhost:3000/v1/thread/{DEVICE_UUID} \
  -H "x-api-key: your-key"
```


---

## **Roadmap (TODO)**

| Feature | Details |  Status |
|-------|--------|--------|
| 1.  **offline llm**: | **Done**. Unified `OfflineLLM` service supports local GGUF execution via `node-llama-cpp` (Server) and `@wllama/wllama` (Browser/WASM). | Implemented |
| 2.  **extension support**: | new manifest-firefox,json for firefox mozilla support. since the manifest.json we have now supports Chromeium based like chrome, brave, kiwi, edge etc. | Planned |
| 3.  **UI Polish**: | **Done**. Enhanced spacing, button styles, and layout compactness. | Completed |
---

## **Why "Memtrace"?**

> **Memory** of your conversations.  
> **Trace** of your thoughts.  
> **Memtrace** = a complete, searchable history of your AI wisdom.

---

> **Memtrace remembers. Connects. And lets you continue — anywhere.**
> **Memtrace AI** — *Because context is king.*

---





Memtrace AI
Turn endless AI chats into searchable, editable, and connected knowledge.

Memtrace AI is a privacy-first Chrome extension that captures and organizes long AI conversations (from ChatGPT, Grok, Copilot, etc.) into a queryable knowledge graph.

It lets you edit, rearrange, and merge conversation chunks across platforms — building prompt-ready contexts without retyping or re-explaining anything.
A single thread can even span multiple chats or platforms on the same or different topics.