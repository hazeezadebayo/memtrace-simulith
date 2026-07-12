import { callLLM } from '../llm/ai.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';
import { getEmbedding, cosineSimilarity } from '../../../extension/llm/embedding.js';
import { runCouncil, runMesh, runTree, setAutomationState, logAutomation, clearAutomationLogs, isCancellationError } from './utils.js';

/**
 * Step-by-step decision tree prompt.
 * Evaluates core intent via explicit questions to prevent the "Tree Mode" black hole,
 * strictly prioritizing token concision by only requesting a score and mode.
 */
const ROUTER_PROMPT = `You are a router that classifies queries into three reasoning modes.

Step 1: Identify the CORE INTENT of the query.

Step 2: Walk through this decision tree:

Q1: Does the query involve multiple stakeholders, competing positions, or ethical debates?
    YES → Go to Q2
    NO → Go to Q3

Q2: Is the goal to determine which position survives scrutiny or is strategically best?
    YES → CLASSIFY AS "council"
    NO → Continue to Q3

Q3: Does the query ask about ideas, opinions, or innovations spreading through a population?
    YES → CLASSIFY AS "mesh"
    NO → Continue to Q4

Q4: Does the query ask about consequences of a specific action, path optimization, or prediction?
    YES → CLASSIFY AS "tree"
    NO → CLASSIFY AS "council" (default)

Step 3: Output your classification.

EXAMPLES OF CORRECT CLASSIFICATION:
- "Should we acquire our competitor or build it?" → council (multiple stakeholders, competing positions)
- "How will public opinion shift?" → mesh (population-level belief change)
- "If we increase ad spend by 30%, what happens?" → tree (specific action, causal chain)

OUTPUT FORMAT:
Return ONLY a valid JSON object. No markdown wrappers.
{
  "satisfaction_score": <int 0-100: how sure are you that this mode correctly captures the user's core intent?>,
  "mode": "<council|mesh|tree>"
}

Query: {QUERY}`;

/**
 * Singleton class to handle deterministic semantic routing.
 * Uses the system's existing Xenova embedding primitives to find the closest match.
 */
class DeterministicRouter {
  static instance = null;
  static THRESHOLD = 75; // Minimum LLM confidence score to bypass fallback

  // Expanded anchor queries defining the gravitational center of each mode
  static ANCHORS = [
    // COUNCIL: adversarial, debate, values, conflict
    { text: "Which option delivers greater value?", mode: "council" },
    { text: "Should we prioritize speed or quality?", mode: "council" },
    { text: "Which choice aligns with our values?", mode: "council" },
    { text: "What ethical stance should we take?", mode: "council" },
    { text: "How do we resolve conflicting priorities between teams?", mode: "council" },

    // MESH: spread, opinion, social dynamics
    { text: "Will this idea gain traction in society?", mode: "mesh" },
    { text: "How do innovations diffuse across cultures?", mode: "mesh" },
    { text: "What will happen in the next decade?", mode: "mesh" },
    { text: "How will technology reshape this field?", mode: "mesh" },
    { text: "What factors drive collective opinion shifts?", mode: "mesh" },

    // TREE: consequences, optimization, prediction, path
    { text: "What are the consequences if we act?", mode: "tree" },
    { text: "How will this decision affect stability?", mode: "tree" },
    { text: "What path maximizes success?", mode: "tree" },
    { text: "How do we minimize risk while scaling?", mode: "tree" },
    { text: "Which proposal wins when judged head‑to‑head?", mode: "tree" }
  ];

  constructor() {
    if (DeterministicRouter.instance) return DeterministicRouter.instance;
    this.anchorEmbeddings = [];
    this.initialized = false;
    DeterministicRouter.instance = this;
  }

  /**
   * Lazily loads and pre-calculates anchor embeddings using system primitives.
   */
  async init() {
    if (!this.initialized) {
      console.log('[Deterministic Router] Pre-computing anchor embeddings via system primitives...');
      for (const anchor of DeterministicRouter.ANCHORS) {
        // Utilizing existing primitive: extension/llm/embedding.js
        const vector = await getEmbedding(anchor.text, "xenova");
        this.anchorEmbeddings.push({ mode: anchor.mode, vector });
      }
      this.initialized = true;
    }
  }

  /**
   * Finds the most semantically similar mode based on the input query.
   * @param {string} query The user's input query.
   * @returns {Promise<string>} The winning mode ('council', 'mesh', or 'tree').
   */
  async fallbackRoute(query) {
    try {
      await this.init();

      // Embed the incoming query using the established system utility
      const queryVector = await getEmbedding(query, "xenova");

      let bestMode = 'council'; // Default fallback
      let highestSimilarity = -Infinity;

      // Compare against pre-embedded anchors
      for (const anchor of this.anchorEmbeddings) {
        const sim = cosineSimilarity(queryVector, anchor.vector);
        if (sim > highestSimilarity) {
          highestSimilarity = sim;
          bestMode = anchor.mode;
        }
      }

      console.log(`[Deterministic Router] Fallback complete. Selected ${bestMode} (Similarity: ${highestSimilarity.toFixed(2)})`);
      return bestMode;
    } catch (err) {
      console.error('[Deterministic Router] Fallback engine failed. Defaulting to tree.', err);
      return 'tree'; // Hard fallback if embedding system throws an error
    }
  }
}

const semanticRouter = new DeterministicRouter();

/**
 * Main routing orchestration function.
 * Preserves exact upstream inputs and downstream outputs.
 */
export async function routeQuery(baseUrl, token, payload, signal) {
  const query = payload.question || payload.decision || '';
  if (!query) throw new Error('Query is required for Router Mode.');

  // Propagate abort immediately if already cancelled
  if (signal?.aborted) throw new Error('Simulation Cancelled by user.');

  clearAutomationLogs(payload.uuid);
  logAutomation(payload.uuid, 'router', 'Evaluating domain classification...');

  const prompt = ROUTER_PROMPT.replace('{QUERY}', query);

  setAutomationState(payload.uuid, 'EVALUATING DOMAIN CLASSIFICATION...');
  console.log('[Router Mode] Requesting LLM mode selection...');

  let llmResponse;
  try {
    llmResponse = await callLLM(prompt, undefined, DEFAULT_CONFIG.llm_provider, DEFAULT_CONFIG.apiKey, DEFAULT_CONFIG.llm_model);
  } catch (e) {
    if (isCancellationError(e, signal)) throw e;
    throw e;
  }

  if (signal?.aborted) throw new Error('Simulation Cancelled by user.');

  // Clean JSON response if wrapped in markdown
  llmResponse = llmResponse.replace(/^```json/m, '').replace(/^```/m, '').trim();

  let mode, score;
  let requireFallback = false;

  try {
    if (!llmResponse) {
      throw new Error('Empty LLM response');
    }
    const parsed = JSON.parse(llmResponse);
    mode = parsed.mode?.toLowerCase();
    score = parseInt(parsed.satisfaction_score, 10);

    // Validate parsed results
    if (!['council', 'mesh', 'tree'].includes(mode) || isNaN(score)) {
      throw new Error('Invalid LLM output format');
    }

    if (score < DeterministicRouter.THRESHOLD) {
      console.log(`[Router Mode] LLM confidence (${score}) below threshold (${DeterministicRouter.THRESHOLD}). Triggering fallback.`);
      requireFallback = true;
    }
  } catch (e) {
    console.warn('[Router Mode] Failed to parse routing LLM output or format invalid. Triggering fallback.', llmResponse);
    requireFallback = true;
    score = 0; // Default score for failed parsing
  }

  // Execute Deterministic Fallback if LLM is unsure or failed
  let finalReasoning = '';
  if (requireFallback) {
    logAutomation(payload.uuid, 'router', 'Confidence low. Running semantic similarity fallback...');
    mode = await semanticRouter.fallbackRoute(query);
    finalReasoning = `Routed via semantic fallback due to low LLM confidence score (${score}/${DeterministicRouter.THRESHOLD}).`;
  } else {
    finalReasoning = `LLM selection confidence score: ${score}/100.`;
  }

  console.log(`[Router Mode] Final Selected Mode: ${mode.toUpperCase()} - ${finalReasoning}`);
  logAutomation(payload.uuid, 'router', `Optimal reality routed: ${mode.toUpperCase()}`);
  logAutomation(payload.uuid, 'router', `Reasoning: ${finalReasoning}`);
  logAutomation(payload.uuid, 'router', `Running selected mode: ${mode.toUpperCase()}...`);

  if (signal?.aborted) throw new Error('Simulation Cancelled by user.');

  let simulationResult;
  let startTime = Date.now();

  try {
    setAutomationState(payload.uuid, `RUNNING SELECTED MODE: ${mode.toUpperCase()}`);
    switch (mode) {
      case 'mesh':
        simulationResult = await runMesh(baseUrl, token, payload, signal);
        break;
      case 'tree':
        simulationResult = await runTree(baseUrl, token, payload, signal);
        break;
      case 'council':
      default:
        simulationResult = await runCouncil(baseUrl, token, payload, signal);
        break;
    }
    setAutomationState(payload.uuid, 'COMPLETED');
    logAutomation(payload.uuid, 'router', 'Router execution complete.');
  } catch (error) {
    if (isCancellationError(error, signal)) {
      throw error;
    }
    logAutomation(payload.uuid, 'error', `Execution failed: ${error.message}`);
    throw new Error(`Execution in ${mode} mode failed: ${error.message}`);
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);

  // Preserve the return structure, mapping the score/fallback info to the legacy 'reasoning' field
  return {
    router_selection: {
      mode,
      reasoning: finalReasoning,
    },
    durationSec,
    simulation_result: simulationResult
  };
}