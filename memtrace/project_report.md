# MemTrace & Simulith: Project Report

## Project Introduction
MemTrace is a Universal Mesh Intelligence and Scenario Decision Simulator. It integrates a local SQLite/Turso FTS5 vector storage backend with a dynamic Chrome Extension and Web App frontend (Simulith) to facilitate real-time ingestion, embedding, and semantic search (RAG) of conversation and logic branches.

## Architectural Flow
1. **Frontend (Simulith / Extension)**: Captures user behavior and evidence via `app.js` and `popup.js`, embedding locally or delegating to the backend.
2. **Backend (Council/Core Server)**: Processes `resimulate` and `ingest` requests using `ThreadletOrchestrator`, indexing memory chunks via `sqlite-adapter.js` with hybrid vector and FTS5 indexing.
3. **Storage (SQLite/Turso)**: Persists chunks using unique compound keys (`uuid:timestamp:index`), retrieving candidates via vector cosine similarity or FTS5 phrase matching.

## Completed Work
*   **Hugging Face Deployment Stability**: Identified and resolved a 502/530 gateway timeout error in the cloud CI/CD pipeline. The server was falling back to `localllm` as its default provider, triggering a massive, synchronous 1.8GB model download on boot inside the Hugging Face Gradio Space, which exceeded the health-check timeout and caused the container to crash. Fixed by explicitly defining `LLM_PROVIDER=qwen` in the CI/CD `.env` to enforce lightweight cloud LLM execution.
*   **UI Defensiveness**: Implemented null-safe access in `llm_agent.js` (`getLLMConfig`) to eliminate `TypeError` crashes when DOM elements are missing.
*   **Resimulation API Integrity**: Fixed the payload formatting in `app.js` to correctly send `newEvidence`, preventing `HTTP 400` errors on `/resimulate`.
*   **Module Cleanup**: Resolved duplicate export `SyntaxError` in `memory.js`.
*   **Extension ID Synchronization & Search Recovery**: Fixed the "no match found" search error. Configured the Extension popup's initialization to detect the extension environment and prepend the explicit `API_BASE` (`http://localhost:3106`).
*   **Auth Cookie Passthrough**: Included `credentials: 'include'` in `/api/auth/me` fetches so the extension pulls the correct `req.user.uuid` matching the ingestion pipeline, restoring chunk visibility in the Files tab and allowing RAG searches to succeed.
*   **Recompiled Assets**: Generated the updated `popup.bundle.js` payload.
*   **API Error Masking Bug**: Fixed a bug in `simulith/public/app.js` where `INSUFFICIENT_TOKENS` (HTTP 402) errors were being intercepted by their own try/catch blocks because the `throw` statement was nested inside the `try` block intended for JSON parsing. Moved the status check outside the block to accurately reflect Gateway/Token errors.
*   **Branch Resimulation Rank Corruption**: Repaired a desynchronization bug in `api/simulith_server.js` where resimulating a branch broke the UI by passing an isolated `length=1` array to the `scoreBranches` heuristic, automatically assigning it `rank: best`. The rescored branch is now placed back into the complete list *before* evaluation to correctly update relative rankings for all branches without overriding them.
*   **Resimulation Branch Database Data Loss**: Fixed a severe structural bug in `api/simulith_server.js` where the engine was aggressively stripping `description`, `action`, and `objections` from the branches before persisting them to `state.runs`. This resulted in the LLM hallucinating during resimulations (because it received `undefined` for those properties) and caused the frontend sibling branches to be destroyed when the UI requested the re-scored branch array back. The backend now accurately saves and persists the full structural branch objects into the SQLite cache.
*   **Client-Side Cache Busting**: Resolved a critical issue where the browser executed an outdated, cached version of `app.js` (loaded as `?v=4`), causing the resimulation pipeline to throw errors like `can't access property "evidenceLinks", branch is undefined`. Bumped the script reference to `?v=7` in `workspace.html` to force browsers to fetch the updated code.
*   **Defensive Rendering Safeguards**: Hardened `renderBranch` and `renderResults` in `app.js` with comprehensive checks for null or undefined branches, reactions, and objections, ensuring stable UI transitions during asynchronous resimulations.

## Currently In Progress
*   Monitoring remote deployment logs for any edge-case branch synchronization issues.

## Remains to be Done
*   Implement advanced edge traversal pruning if the FTS5 pool becomes overly polluted.
*   Migrate memory edge caching to Redis if production scaling requires multi-instance access.
