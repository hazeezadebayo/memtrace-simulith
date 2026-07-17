import { renderPopulationSvg, renderRelationsGraphSvg, renderTreeFlowHtml, renderTreeScatterSvg, renderTreeCausalSvg, renderTreeDrawerHtml, renderDominantFuturesHtml } from './visualize.js';
import { initTutorialPhysics } from './tutorial_physics.js';
import { DEFAULT_CONFIG } from '/extension/env/config.js';

// --- Global Fetch Interceptor for JWT Bearer Token Injection ---
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
  const token = localStorage.getItem('simulith_token');
  if (token) {
    options.headers = options.headers || {};
    if (options.headers instanceof Headers) {
      if (!options.headers.has('Authorization')) {
        options.headers.set('Authorization', `Bearer ${token}`);
      }
    } else if (Array.isArray(options.headers)) {
      const hasAuth = options.headers.some(([k]) => k.toLowerCase() === 'authorization');
      if (!hasAuth) {
        options.headers.push(['Authorization', `Bearer ${token}`]);
      }
    } else {
      const keys = Object.keys(options.headers);
      const hasAuth = keys.some(k => k.toLowerCase() === 'authorization');
      if (!hasAuth) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  }
  return originalFetch.call(this, url, options);
};

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── DOM refs ────────────────────────────────────────────────────────
const form = document.getElementById('scenario-form');
const statusEl = document.getElementById('status');
const results = document.getElementById('results');
const questionInput = document.getElementById('question');
const factsInput = document.getElementById('facts');
const customPersonaInput = document.getElementById('custom-persona-input');
const btnCpPrev = document.getElementById('btn-cp-prev');
const btnCpNext = document.getElementById('btn-cp-next');
const btnCpAdd = document.getElementById('btn-cp-add');
const btnCpRemove = document.getElementById('btn-cp-remove');
const cpIndicator = document.getElementById('cp-indicator');

let customPersonaList = [''];
let currentCpIndex = 0;

function updateCpUi() {
  if (!customPersonaInput) return;
  customPersonaInput.value = customPersonaList[currentCpIndex] || '';
  if (cpIndicator) cpIndicator.innerText = `${currentCpIndex + 1}/${customPersonaList.length}`;
}
const branchCountInput = document.getElementById('branch-count');
const personaCountInput = document.getElementById('persona-count');
const recentRuns = document.getElementById('recent-runs');
const btnModeCouncil = document.getElementById('btn-mode-council');
const btnModeMesh = document.getElementById('btn-mode-mesh');
const btnModeTree = document.getElementById('btn-mode-tree');
const btnModeRouter = document.getElementById('btn-mode-router');
const btnModeAutomation = document.getElementById('btn-mode-automation');
const meshParamsDiv = document.getElementById('mesh-params');
const meshFeedPanel = document.getElementById('mesh-feed-panel');
const feedScroller = document.getElementById('feed-scroller');
const inspector = document.getElementById('agent-inspector');
const inspectorContent = document.getElementById('inspector-content');
const chatModal = document.getElementById('chat-modal');
const chatHistory = document.getElementById('chat-history');
const chatAgentName = document.getElementById('chat-agent-name');
const chatInput = document.getElementById('chat-input');

// ── State ────────────────────────────────────────────────────────────
let currentMode = 'council';
let currentMeshSimId = null;
let currentCouncilSimId = null;
let currentChatAgent = null;
const chatHistoriesByAgent = {};
let userTokens = 0;
// Unified simulation state for all three modes.
// Values: 'idle' | 'loading' | 'done'
const modeStatus = { council: 'idle', mesh: 'idle', tree: 'idle', router: 'idle', divergence: 'idle' };
let _previousMode = null;   // last non-profile mode, for profile toggle
let currentAbortController = null;

let currentTelemetry = {
  currentTick: 0,
  maxTicks: 0,
  llmCallCount: 0,
  elapsed: '0.0s',
  determinedField: 'CLASSIFYING DOMAIN...',
  activeSchema: 'N/A',
  graphDensity: '0 relations / 0 nodes (0 schemas)',
  durations: []
};
let telemetryInterval = null;
let telemetryStartTime = 0;
let currentTutorialCleanup = null;

// ── Mode toggle ──────────────────────────────────────────────────────
// Council / Mesh wired here; Tree wired after btnModeTree null-check below.
btnModeCouncil.addEventListener('click', () => setMode('council'));
btnModeMesh.addEventListener('click', () => setMode('mesh'));
if (btnModeTree) btnModeTree.addEventListener('click', () => setMode('tree'));
if (btnModeRouter) btnModeRouter.addEventListener('click', () => setMode('router'));
if (btnModeAutomation) btnModeAutomation.addEventListener('click', () => setMode('divergence'));

const depthMetricEl = document.getElementById('depth-metric');
const scaleMetricEl = document.getElementById('scale-metric');
if (depthMetricEl) depthMetricEl.addEventListener('input', () => updateTelemetryStandby());
if (scaleMetricEl) scaleMetricEl.addEventListener('input', () => updateTelemetryStandby());
if (customPersonaInput) {
  customPersonaInput.addEventListener('input', (e) => {
    customPersonaList[currentCpIndex] = e.target.value;
  });
}
if (btnCpPrev) {
  btnCpPrev.addEventListener('click', () => {
    if (currentCpIndex > 0) { currentCpIndex--; updateCpUi(); }
  });
}
if (btnCpNext) {
  btnCpNext.addEventListener('click', () => {
    if (currentCpIndex < customPersonaList.length - 1) { currentCpIndex++; updateCpUi(); }
  });
}
if (btnCpAdd) {
  btnCpAdd.addEventListener('click', () => {
    customPersonaList.push('');
    currentCpIndex = customPersonaList.length - 1;
    updateCpUi();
  });
}
if (btnCpRemove) {
  btnCpRemove.addEventListener('click', () => {
    if (customPersonaList.length > 1) {
      customPersonaList.splice(currentCpIndex, 1);
      if (currentCpIndex >= customPersonaList.length) currentCpIndex = customPersonaList.length - 1;
      updateCpUi();
    } else {
      customPersonaList = [''];
      updateCpUi();
    }
  });
}

const COUNCIL_EMPTY_STATE = `

<div style="position: absolute; top:0; left:0; width: 100%; height: 100%; border-radius: 4px; overflow: hidden;">
  <canvas id="tutorial-canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none;"></canvas>
  <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden; box-sizing: border-box; padding: 1rem;">
    <div style="margin: 6vh auto; position: relative; z-index: 1; padding: 2rem; width: 100%; max-width: 900px; color: #CCCCCC; background: rgba(10, 10, 12, 0.75); backdrop-filter: blur(16px); border: 1px solid rgba(255,152,0,0.3); border-radius: 8px; box-shadow: 0 12px 40px rgba(0,0,0,0.4); overflow: hidden; box-sizing: border-box;">
      <div class="dash-top"></div><div class="dash-right"></div><div class="dash-bottom"></div><div class="dash-left"></div>
      <h2 style="margin-top: 0; color: #FFFFFF; font-size: clamp(1.2rem, 3vw, 1.6rem); border-bottom: 1px solid rgba(255,152,0,0.2); padding-bottom: 0.8rem; display: flex; flex-wrap: wrap; gap: 0.8rem; justify-content: space-between; align-items: center;">

      Council Mode: Strategic Deliberation
      <span style="font-size: 0.75rem; padding: 0.3rem 0.6rem; background: rgba(255,152,0,0.1); border-radius: 12px; font-family: var(--font-mono); color: var(--accent-orange); border: 1px solid rgba(255,152,0,0.2);">INTERACTIVE TUTORIAL</span>
    </h2>
    <p style="margin-bottom: 1.5rem; font-size: 1rem; line-height: 1.5;">Council Mode simulates high-stakes decision making by exposing your hypothesis to a team of mathematically rigorous, LLM-generated personas.</p>
    
    <div style="display: flex; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 1.5rem;">
      <div class="tut-box-dark" style="flex: 1 1 250px; padding: clamp(1rem, 3vw, 1.5rem); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); box-sizing: border-box;">
        <h4 style="color: #FFFFFF; margin-bottom: 0.8rem; margin-top: 0; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">How it Works</h4>
        <ul style="padding-left: 1.2rem; margin: 0; line-height: 1.6; font-size: 0.85rem;">
          <li style="margin-bottom: 0.5rem;"><strong style="color:#FFFFFF;">1. Semantic Domain Matching:</strong> Your query is classified and embedded via Xenova to fetch domain-specific branch logic.</li>
          <li style="margin-bottom: 0.5rem;"><strong style="color:#FFFFFF;">2. Persona Generation:</strong> The engine spawns distinct stakeholders with explicit <code>riskBias</code> and <code>evidenceDemand</code> thresholds.</li>
          <li style="margin-bottom: 0.5rem;"><strong style="color:#FFFFFF;">3. Heuristic Scoring:</strong> Personas vote on branches. Their underlying math biases directly influence the final branch viability score.</li>
          <li><strong style="color:#FFFFFF;">4. Counterfactuals:</strong> The engine calculates the most survivable failure path if the primary assumption is wrong.</li>
        </ul>
      </div>
      <div class="tut-box-dark" style="flex: 1 1 250px; padding: clamp(1rem, 3vw, 1.5rem); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); box-sizing: border-box;">
        <h4 style="color: #FFFFFF; margin-top: 0; margin-bottom: 0.8rem; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">How to Use</h4>
        <ul style="padding-left: 1.2rem; margin: 0; line-height: 1.6; font-size: 0.85rem;">
          <li style="margin-bottom: 0.6rem;"><strong style="color:var(--accent-orange);">Hypothesis:</strong> Enter your core decision or assumption on the left.</li>
          <li style="margin-bottom: 0.6rem;"><strong style="color:var(--accent-orange);">Facts:</strong> Inject supporting facts to satisfy agent <code>evidenceDemand</code> thresholds.</li>
          <li style="margin-bottom: 0.6rem;"><strong style="color:var(--accent-orange);">Presets (🧪):</strong> Click the flask icon above to load pre-configured scenarios.</li>
          <li><strong style="color:var(--accent-orange);">Telemetry:</strong> Watch the monitor panel on the right to track agent memory decay and live API call latency.</li>
        </ul>
      </div>
    </div>
    
    <div style="text-align: center; color: var(--accent-orange); font-size: 0.85rem; font-family: var(--font-mono); padding-top: 1.2rem; border-top: 1px dashed rgba(255,152,0,0.2); animation: pulse 2s infinite;">» AWAITING CONFIGURATION. INTERACT WITH THE BACKGROUND OR CLICK 'LAUNCH COUNCIL' TO BEGIN.</div>
  </div>
</div>
`;

const MESH_EMPTY_STATE = `
<style>
  .tut-box-mesh {
    transition: transform 0.2s, background 0.2s, border-color 0.2s;
    background: rgba(0,0,0,0.2) !important;
  }
  .tut-box-mesh:hover {
    transform: translateY(-2px);
    background: rgba(255,255,255,0.08) !important;
    border-color: rgba(76,175,133,0.4) !important;
  }
</style>
<div style="position: absolute; top:0; left:0; width: 100%; height: 100%; border-radius: 4px; overflow: hidden;">
  <canvas id="tutorial-canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none;"></canvas>
  <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden; box-sizing: border-box; padding: 1rem;">
    <div style="margin: 6vh auto; position: relative; z-index: 1; padding: 2rem; width: 100%; max-width: 900px; color: #CCCCCC; background: rgba(10, 10, 12, 0.75); backdrop-filter: blur(16px); border: 1px solid rgba(76,175,133,0.3); border-radius: 8px; box-shadow: 0 12px 40px rgba(0,0,0,0.4); overflow: hidden; box-sizing: border-box;">
      <div class="dash-top"></div><div class="dash-right"></div><div class="dash-bottom"></div><div class="dash-left"></div>
      <h2 style="margin-top: 0; color: #FFFFFF; font-size: clamp(1.2rem, 3vw, 1.6rem); border-bottom: 1px solid rgba(76,175,133,0.2); padding-bottom: 0.8rem; display: flex; flex-wrap: wrap; gap: 0.8rem; justify-content: space-between; align-items: center;">
      Mesh Mode: Autonomous Consensus
      <span style="font-size: 0.75rem; padding: 0.3rem 0.6rem; background: rgba(76,175,133,0.1); border-radius: 12px; font-family: var(--font-mono); color: var(--accent-green); border: 1px solid rgba(76,175,133,0.2);">INTERACTIVE TUTORIAL</span>
    </h2>
    <p style="margin-bottom: 1.5rem; font-size: 1rem; line-height: 1.5;">Mesh Feed is the live console for decentralized agent deliberation. The system extracts a dense knowledge graph from your prompt and drops agents into an interactive physics arena.</p>
    
    <div style="display: flex; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 1.5rem;">
      <div class="tut-box-mesh" style="flex: 1 1 250px; padding: clamp(1rem, 3vw, 1.5rem); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); box-sizing: border-box;">
        <h4 style="color: #FFFFFF; margin-top: 0; margin-bottom: 0.8rem; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">How it Works</h4>
        <ul style="padding-left: 1.2rem; margin: 0; font-size: 0.85rem; line-height: 1.6;">
          <li style="margin-bottom: 0.5rem;"><strong style="color:#FFFFFF;">Entity Extraction:</strong> Facts are converted into a dynamic network graph.</li>
          <li style="margin-bottom: 0.5rem;"><strong style="color:#FFFFFF;">Live Deliberation:</strong> Agents interact autonomously over multiple 'Ticks'.</li>
          <li><strong style="color:#FFFFFF;">Belief Mutation:</strong> Agent positions shift dynamically as they influence each other based on platform algorithms.</li>
        </ul>
      </div>
      <div class="tut-box-mesh" style="flex: 1 1 250px; padding: clamp(1rem, 3vw, 1.5rem); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); box-sizing: border-box;">
        <h4 style="color: #FFFFFF; margin-top: 0; margin-bottom: 0.8rem; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">How to Use</h4>
        <ul style="padding-left: 1.2rem; margin: 0; line-height: 1.6; font-size: 0.85rem;">
          <li style="margin-bottom: 0.6rem;"><strong style="color:var(--accent-green);">Goal:</strong> Define the topic for the mesh to debate.</li>
          <li style="margin-bottom: 0.6rem;"><strong style="color:var(--accent-green);">Facts & Context:</strong> Supply ground truth that anchors the agents and limits hallucination.</li>
          <li style="margin-bottom: 0.6rem;"><strong style="color:var(--accent-green);">Presets (🧪):</strong> Use the flask icon above to test complex, multi-faction scenarios.</li>
          <li><strong style="color:var(--accent-green);">Live Feed:</strong> Watch the bottom-left console as agents broadcast on their local platforms (Twitter, Reddit, etc).</li>
        </ul>
      </div>
    </div>
    
    <div style="text-align: center; color: var(--accent-green); font-size: 0.85rem; font-family: var(--font-mono); padding-top: 1.2rem; border-top: 1px dashed rgba(76,175,133,0.2); animation: pulse 2s infinite;">» AWAITING CONFIGURATION. INTERACT WITH THE BACKGROUND OR CLICK 'LAUNCH MESH' TO BEGIN.</div>
  </div>
</div>
`;

const TREE_EMPTY_STATE = `
<style>
  .tut-box-tree {
    transition: transform 0.2s, background 0.2s, border-color 0.2s;
    background: rgba(0,0,0,0.2) !important;
  }
  .tut-box-tree:hover {
    transform: translateY(-2px);
    background: rgba(255,255,255,0.08) !important;
    border-color: rgba(124,124,124,0.4) !important;
  }
  #tree-physics-canvas {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    z-index: 0;
    pointer-events: none;
  }
</style>
<div style="position: absolute; top:0; left:0; width: 100%; height: 100%; border-radius: 4px; overflow: hidden;">
  <canvas id="tree-physics-canvas"></canvas>
  <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden; box-sizing: border-box; padding: 1rem;">
    <div style="margin: 6vh auto; position: relative; z-index: 1; padding: 2rem; width: 100%; max-width: 900px; color: #CCCCCC; background: rgba(10, 10, 12, 0.75); backdrop-filter: blur(16px); border: 1px solid rgba(124,124,124,0.3); border-radius: 8px; box-shadow: 0 12px 40px rgba(0,0,0,0.4); overflow: hidden; box-sizing: border-box;">
      <div class="dash-top"></div><div class="dash-right"></div><div class="dash-bottom"></div><div class="dash-left"></div>
    <h2 style="margin-top: 0; color: #FFFFFF; font-size: clamp(1.2rem, 3vw, 1.6rem); border-bottom: 1px solid rgba(124,124,124,0.2); padding-bottom: 0.8rem; display: flex; flex-wrap: wrap; gap: 0.8rem; justify-content: space-between; align-items: center;">
    Tree Mode: Causal Forecasting
    <span style="font-size: 0.75rem; padding: 0.3rem 0.6rem; background: rgba(124,124,124,0.1); border-radius: 12px; font-family: var(--font-mono); color: #7c7c7c; border: 1px solid rgba(124,124,124,0.2);">SCENARIO PLANNER</span>
  </h2>
  <p style="margin-bottom: 1.5rem; font-size: 1rem; line-height: 1.5;">Tree Mode is a deterministic state-space simulation engine. Instead of a social feed, it computes formal causal paths to forecast downstream consequences.</p>
  
  <div style="display: flex; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 1.5rem;">
    <div class="tut-box-tree" style="flex: 1 1 250px; padding: clamp(1rem, 3vw, 1.5rem); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); box-sizing: border-box;">
      <h4 style="color: #FFFFFF; margin-top: 0; margin-bottom: 0.8rem; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">How it Works</h4>
      <ul style="padding-left: 1.2rem; margin: 0; font-size: 0.85rem; line-height: 1.6;">
        <li style="margin-bottom: 0.5rem;"><strong style="color:#FFFFFF;">State Generation:</strong> Physics models establish variable elasticity bounds.</li>
        <li style="margin-bottom: 0.5rem;"><strong style="color:#FFFFFF;">Utility Scoring:</strong> Faction utilities are scored via fixed nonlinear functions.</li>
        <li><strong style="color:#FFFFFF;">MCTS Branching:</strong> Monte Carlo Tree Search prunes unviable paths to find high-probability outcomes.</li>
      </ul>
    </div>
    <div class="tut-box-tree" style="flex: 1 1 250px; padding: clamp(1rem, 3vw, 1.5rem); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); box-sizing: border-box;">
      <h4 style="color: #FFFFFF; margin-top: 0; margin-bottom: 0.8rem; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">How to Use</h4>
      <ul style="padding-left: 1.2rem; margin: 0; line-height: 1.6; font-size: 0.85rem;">
        <li style="margin-bottom: 0.6rem;"><strong style="color:#7c7c7c;">Decision Seed:</strong> The core "What If" scenario.</li>
        <li style="margin-bottom: 0.6rem;"><strong style="color:#7c7c7c;">Parameters:</strong> Set Tree Depth and Branching Factor to limit combinatorial explosion.</li>
        <li style="margin-bottom: 0.6rem;"><strong style="color:#7c7c7c;">Presets (🧪):</strong> Use the flask icon to load pre-configured scenarios.</li>
        <li><strong style="color:#7c7c7c;">Visualizations:</strong> Explore Consequence Flow, Outcome Space, and the final Causal Tree.</li>
      </ul>
    </div>
  </div>
  
  <div style="text-align: center; color: #7c7c7c; font-size: 0.85rem; font-family: var(--font-mono); padding-top: 1.2rem; border-top: 1px dashed rgba(124,124,124,0.2); animation: pulse 2s infinite;">» AWAITING SEED. CONFIGURE PARAMS OR CLICK 'LAUNCH TREE' TO COMPUTE CAUSALITY.</div>
    </div>
  </div>
</div>
`;

const TREE_LOADING_STATE = `
<div style="padding: 2.5rem; max-width: 800px; margin: 2rem auto; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); position: relative; overflow: hidden;">
  <div class="dash-top"></div><div class="dash-right"></div><div class="dash-bottom"></div><div class="dash-left"></div>
  <div style="text-align: center; margin-bottom: 2.5rem; position: relative; z-index: 1;">
    <h2 style="margin: 0 0 0.5rem 0; color: var(--text-primary); font-size: 1.5rem; letter-spacing: 0.05em;">COMPUTING CAUSAL TREE</h2>
    <p style="margin: 0; color: var(--text-secondary); font-size: 0.95rem;">Evaluating downstream consequences via formal state-space search.</p>
  </div>
  
  <div style="display: flex; justify-content: space-between; align-items: flex-start; position: relative; padding: 1rem 0;">
    <!-- Connecting Line -->
    <div style="position: absolute; top: 2.5rem; left: 10%; right: 10%; height: 2px; background: var(--border-color); z-index: 0;"></div>
    
    <!-- Node 1 -->
    <div style="flex: 1; text-align: center; position: relative; z-index: 1; padding: 0 10px;">
      <div style="width: 2.5rem; height: 2.5rem; line-height: 2.5rem; margin: 0 auto 1rem; background: var(--bg-main); border: 2px solid #7c7c7c; color: #7c7c7c; border-radius: 50%; font-family: var(--font-mono); font-weight: bold; font-size: 1.1rem;">1</div>
      <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 0.3rem;">Physics Bounds</div>
      <div style="color: var(--text-secondary); font-size: 0.75rem; line-height: 1.3;">Establishing variable elasticity models.</div>
      <div style="margin-top: 0.5rem; color: #888; font-family: var(--font-mono); font-size: 0.7rem;">~5 SECONDS</div>
    </div>
    
    <!-- Node 2 -->
    <div style="flex: 1; text-align: center; position: relative; z-index: 1; padding: 0 10px;">
      <div style="width: 2.5rem; height: 2.5rem; line-height: 2.5rem; margin: 0 auto 1rem; background: var(--bg-main); border: 2px solid #7c7c7c; color: #7c7c7c; border-radius: 50%; font-family: var(--font-mono); font-weight: bold; font-size: 1.1rem;">2</div>
      <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 0.3rem;">State Transition</div>
      <div style="color: var(--text-secondary); font-size: 0.75rem; line-height: 1.3;">Generating downstream permutations.</div>
      <div style="margin-top: 0.5rem; color: #888; font-family: var(--font-mono); font-size: 0.7rem;">~15 SECONDS</div>
    </div>
    
    <!-- Node 3 -->
    <div style="flex: 1; text-align: center; position: relative; z-index: 1; padding: 0 10px;">
      <div style="width: 2.5rem; height: 2.5rem; line-height: 2.5rem; margin: 0 auto 1rem; background: var(--bg-main); border: 2px solid #7c7c7c; color: #7c7c7c; border-radius: 50%; font-family: var(--font-mono); font-weight: bold; font-size: 1.1rem;">3</div>
      <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 0.3rem;">Utility Scoring</div>
      <div style="color: var(--text-secondary); font-size: 0.75rem; line-height: 1.3;">Evaluating stakeholder impact matrices.</div>
      <div style="margin-top: 0.5rem; color: #888; font-family: var(--font-mono); font-size: 0.7rem;">~20 SECONDS</div>
    </div>
    
    <!-- Node 4 -->
    <div style="flex: 1; text-align: center; position: relative; z-index: 1; padding: 0 10px;">
      <div style="width: 2.5rem; height: 2.5rem; line-height: 2.5rem; margin: 0 auto 1rem; background: var(--bg-main); border: 2px solid #7c7c7c; color: #7c7c7c; border-radius: 50%; font-family: var(--font-mono); font-weight: bold; font-size: 1.1rem;">4</div>
      <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 0.3rem;">MCTS Pruning</div>
      <div style="color: var(--text-secondary); font-size: 0.75rem; line-height: 1.3;">Trimming unviable paths via search limits.</div>
      <div style="margin-top: 0.5rem; color: #888; font-family: var(--font-mono); font-size: 0.7rem;">~10 SECONDS</div>
    </div>
  </div>
  
  <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color); text-align: center;">
    <div style="display: inline-block; background: rgba(0,0,0,0.04); padding: 0.5rem 1rem; border-radius: 4px; font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-primary);">
      ESTIMATED COMPLETION: <strong style="color: #7c7c7c;">~1 MINUTE</strong>
    </div>
    <div style="margin-top: 1rem; color: #7c7c7c; font-size: 0.8rem; font-family: var(--font-mono); animation: pulse 1.5s infinite;">» LIVE COMPUTATION >> EXPANDING CAUSAL NODES...</div>
  </div>
</div>
`;

const COUNCIL_LOADING_STATE = `
<div style="padding: 2.5rem; max-width: 800px; margin: 2rem auto; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); position: relative; overflow: hidden;">
  <div class="dash-top"></div><div class="dash-right"></div><div class="dash-bottom"></div><div class="dash-left"></div>
  <div style="text-align: center; margin-bottom: 2.5rem; position: relative; z-index: 1;">
    <h2 style="margin: 0 0 0.5rem 0; color: var(--text-primary); font-size: 1.5rem; letter-spacing: 0.05em;">COUNCIL MODE: STRATEGIC DELIBERATION</h2>
    <p style="margin: 0; color: var(--text-secondary); font-size: 0.95rem;">A multi-agent committee will mathematically evaluate your hypothesis across alternative branches.</p>
  </div>
  
  <div style="display: flex; justify-content: space-between; align-items: flex-start; position: relative; padding: 1rem 0;">
    <!-- Connecting Line -->
    <div style="position: absolute; top: 2.5rem; left: 10%; right: 10%; height: 2px; background: var(--border-color); z-index: 0;"></div>
    
    <!-- Node 1 -->
    <div style="flex: 1; text-align: center; position: relative; z-index: 1; padding: 0 10px;">
      <div style="width: 2.5rem; height: 2.5rem; line-height: 2.5rem; margin: 0 auto 1rem; background: var(--bg-main); border: 2px solid var(--accent-orange); color: var(--accent-orange); border-radius: 50%; font-family: var(--font-mono); font-weight: bold; font-size: 1.1rem;">1</div>
      <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 0.3rem;">RAG Extraction</div>
      <div style="color: var(--text-secondary); font-size: 0.75rem; line-height: 1.3;">Semantic Domain Matching via Xenova Embeddings.</div>
      <div style="margin-top: 0.5rem; color: #888; font-family: var(--font-mono); font-size: 0.7rem;">~5-10 SECONDS</div>
    </div>
    
    <!-- Node 2 -->
    <div style="flex: 1; text-align: center; position: relative; z-index: 1; padding: 0 10px;">
      <div style="width: 2.5rem; height: 2.5rem; line-height: 2.5rem; margin: 0 auto 1rem; background: var(--bg-main); border: 2px solid var(--accent-orange); color: var(--accent-orange); border-radius: 50%; font-family: var(--font-mono); font-weight: bold; font-size: 1.1rem;">2</div>
      <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 0.3rem;">Agent Spawn</div>
      <div style="color: var(--text-secondary); font-size: 0.75rem; line-height: 1.3;">Instantiating stakeholders with distinct risk & evidence biases.</div>
      <div style="margin-top: 0.5rem; color: #888; font-family: var(--font-mono); font-size: 0.7rem;">~10-15 SECONDS</div>
    </div>
    
    <!-- Node 3 -->
    <div style="flex: 1; text-align: center; position: relative; z-index: 1; padding: 0 10px;">
      <div style="width: 2.5rem; height: 2.5rem; line-height: 2.5rem; margin: 0 auto 1rem; background: var(--bg-main); border: 2px solid var(--accent-orange); color: var(--accent-orange); border-radius: 50%; font-family: var(--font-mono); font-weight: bold; font-size: 1.1rem;">3</div>
      <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 0.3rem;">Deliberation</div>
      <div style="color: var(--text-secondary); font-size: 0.75rem; line-height: 1.3;">Cross-branch scoring via heuristic viability matrices.</div>
      <div style="margin-top: 0.5rem; color: #888; font-family: var(--font-mono); font-size: 0.7rem;">~10-15 MINUTES</div>
    </div>
    
    <!-- Node 4 -->
    <div style="flex: 1; text-align: center; position: relative; z-index: 1; padding: 0 10px;">
      <div style="width: 2.5rem; height: 2.5rem; line-height: 2.5rem; margin: 0 auto 1rem; background: var(--bg-main); border: 2px solid var(--accent-orange); color: var(--accent-orange); border-radius: 50%; font-family: var(--font-mono); font-weight: bold; font-size: 1.1rem;">4</div>
      <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 0.3rem;">Synthesis</div>
      <div style="color: var(--text-secondary); font-size: 0.75rem; line-height: 1.3;">Generating counterfactuals and identifying critical failure paths.</div>
      <div style="margin-top: 0.5rem; color: #888; font-family: var(--font-mono); font-size: 0.7rem;">~2-5 MINUTES</div>
    </div>
  </div>
  
  <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color); text-align: center;">
    <div style="display: inline-block; background: rgba(0,0,0,0.04); padding: 0.5rem 1rem; border-radius: 4px; font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-primary);">
      ESTIMATED COMPLETION: <strong style="color: var(--accent-green);">~15-20 MINUTES</strong>
    </div>
    <div style="margin-top: 1rem; color: var(--accent-orange); font-size: 0.8rem; font-family: var(--font-mono); animation: pulse 1.5s infinite;">» LIVE INTERACTIONS >> PROCESSING; THIS MAY TAKE UP TO 20 MIN DEPENDING ON AGENT COUNT...</div>
  </div>
</div>
`;

const MESH_LOADING_STATE = `
<div style="padding: 2.5rem; max-width: 800px; margin: 2rem auto; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); position: relative; overflow: hidden;">
  <div class="dash-top"></div><div class="dash-right"></div><div class="dash-bottom"></div><div class="dash-left"></div>
  <div style="text-align: center; margin-bottom: 2.5rem; position: relative; z-index: 1;">
    <h2 style="margin: 0 0 0.5rem 0; color: var(--text-primary); font-size: 1.5rem; letter-spacing: 0.05em;">MESH MODE: AUTONOMOUS CONSENSUS</h2>
    <p style="margin: 0; color: var(--text-secondary); font-size: 0.95rem;">Watch an entire ecosystem of agents battle over your idea in a live physics arena.</p>
  </div>
  
  <div style="display: flex; justify-content: space-between; align-items: flex-start; position: relative; padding: 1rem 0;">
    <!-- Connecting Line -->
    <div style="position: absolute; top: 2.5rem; left: 10%; right: 10%; height: 2px; background: var(--border-color); z-index: 0;"></div>
    
    <!-- Node 1 -->
    <div style="flex: 1; text-align: center; position: relative; z-index: 1; padding: 0 10px;">
      <div style="width: 2.5rem; height: 2.5rem; line-height: 2.5rem; margin: 0 auto 1rem; background: var(--bg-main); border: 2px solid var(--accent-green); color: var(--accent-green); border-radius: 50%; font-family: var(--font-mono); font-weight: bold; font-size: 1.1rem;">1</div>
      <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 0.3rem;">Graph Building</div>
      <div style="color: var(--text-secondary); font-size: 0.75rem; line-height: 1.3;">Converting your facts into a structured semantic knowledge network.</div>
      <div style="margin-top: 0.5rem; color: #888; font-family: var(--font-mono); font-size: 0.7rem;">1895.4s</div>
    </div>
    
    <!-- Node 2 -->
    <div style="flex: 1; text-align: center; position: relative; z-index: 1; padding: 0 10px;">
      <div style="width: 2.5rem; height: 2.5rem; line-height: 2.5rem; margin: 0 auto 1rem; background: var(--bg-main); border: 2px solid var(--accent-green); color: var(--accent-green); border-radius: 50%; font-family: var(--font-mono); font-weight: bold; font-size: 1.1rem;">2</div>
      <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 0.3rem;">Mesh Drop</div>
      <div style="color: var(--text-secondary); font-size: 0.75rem; line-height: 1.3;">Injecting agents into the D3 force-directed physics engine.</div>
      <div style="margin-top: 0.5rem; color: #888; font-family: var(--font-mono); font-size: 0.7rem;">1685.8s</div>
    </div>
    
    <!-- Node 3 -->
    <div style="flex: 1; text-align: center; position: relative; z-index: 1; padding: 0 10px;">
      <div style="width: 2.5rem; height: 2.5rem; line-height: 2.5rem; margin: 0 auto 1rem; background: var(--bg-main); border: 2px solid var(--accent-green); color: var(--accent-green); border-radius: 50%; font-family: var(--font-mono); font-weight: bold; font-size: 1.1rem;">3</div>
      <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 0.3rem;">Live Ticks</div>
      <div style="color: var(--text-secondary); font-size: 0.75rem; line-height: 1.3;">Agents debate and mutate beliefs across multiple iterative rounds.</div>
      <div style="margin-top: 0.5rem; color: #888; font-family: var(--font-mono); font-size: 0.7rem;">2174.2s / TICK</div>
    </div>
    
    <!-- Node 4 -->
    <div style="flex: 1; text-align: center; position: relative; z-index: 1; padding: 0 10px;">
      <div style="width: 2.5rem; height: 2.5rem; line-height: 2.5rem; margin: 0 auto 1rem; background: var(--bg-main); border: 2px solid var(--accent-green); color: var(--accent-green); border-radius: 50%; font-family: var(--font-mono); font-weight: bold; font-size: 1.1rem;">4</div>
      <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 0.3rem;">Resolution</div>
      <div style="color: var(--text-secondary); font-size: 0.75rem; line-height: 1.3;">Polling the final consensus state and generating the report.</div>
      <div style="margin-top: 0.5rem; color: #888; font-family: var(--font-mono); font-size: 0.7rem;">539.5s</div>
    </div>
  </div>
  
  <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color); text-align: center;">
    <div style="margin-top: 1rem; color: var(--accent-orange); font-size: 0.8rem; font-family: var(--font-mono); animation: pulse 1.5s infinite;">» LIVE INTERACTIONS >> PROCESSING; THIS MAY TAKE UP TO 3 HOURS DEPENDING ON AGENT COUNT...</div>
  </div>
</div>
`;

const ROUTER_EMPTY_STATE = `
<div style="position: absolute; top:0; left:0; width: 100%; height: 100%; border-radius: 4px; overflow: hidden;">
  <canvas id="tutorial-canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none;"></canvas>
  <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden; box-sizing: border-box; padding: 1rem;">
    <div style="margin: 6vh auto; position: relative; z-index: 1; padding: 2rem; width: 100%; max-width: 900px; color: #CCCCCC; background: rgba(10, 10, 12, 0.75); backdrop-filter: blur(16px); border: 1px solid rgba(124,124,124,0.3); border-radius: 8px; box-shadow: 0 12px 40px rgba(0,0,0,0.4); overflow: hidden; box-sizing: border-box;">
      <div class="dash-top"></div><div class="dash-right"></div><div class="dash-bottom"></div><div class="dash-left"></div>
      <h2 style="margin-top: 0; color: #FFFFFF; font-size: clamp(1.2rem, 3vw, 1.6rem); border-bottom: 1px solid rgba(124,124,124,0.2); padding-bottom: 0.8rem; display: flex; flex-wrap: wrap; gap: 0.8rem; justify-content: space-between; align-items: center;">
      Router Mode: Optimal Reasoning Selection
      <span style="font-size: 0.75rem; padding: 0.3rem 0.6rem; background: rgba(124,124,124,0.1); border-radius: 12px; font-family: var(--font-mono); color: #7c7c7c; border: 1px solid rgba(124,124,124,0.2);">AUTOMATED ROUTING</span>
    </h2>
    <p style="margin-bottom: 1.5rem; font-size: 1rem; line-height: 1.5;">Router Mode automatically classifies your query and routes it to the most appropriate reasoning engine (Council, Mesh, or Tree).</p>
    <div style="text-align: center; color: #7c7c7c; font-size: 0.85rem; font-family: var(--font-mono); padding-top: 1.2rem; border-top: 1px dashed rgba(124,124,124,0.2); animation: pulse 2s infinite;">» AWAITING QUERY. ENTER YOUR HYPOTHESIS AND CLICK 'LAUNCH ROUTER' TO AUTOMATE REASONING.</div>
  </div>
</div>
`;

const DIVERGENCE_EMPTY_STATE = `
<div style="position: absolute; top:0; left:0; width: 100%; height: 100%; border-radius: 4px; overflow: hidden;">
  <canvas id="tutorial-canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none;"></canvas>
  <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden; box-sizing: border-box; padding: 1rem;">
    <div style="margin: 6vh auto; position: relative; z-index: 1; padding: 2rem; width: 100%; max-width: 900px; color: #CCCCCC; background: rgba(10, 10, 12, 0.75); backdrop-filter: blur(16px); border: 1px solid rgba(124,124,124,0.3); border-radius: 8px; box-shadow: 0 12px 40px rgba(0,0,0,0.4); overflow: hidden; box-sizing: border-box;">
      <div class="dash-top"></div><div class="dash-right"></div><div class="dash-bottom"></div><div class="dash-left"></div>
      <h2 style="margin-top: 0; color: #FFFFFF; font-size: clamp(1.2rem, 3vw, 1.6rem); border-bottom: 1px solid rgba(124,124,124,0.2); padding-bottom: 0.8rem; display: flex; flex-wrap: wrap; gap: 0.8rem; justify-content: space-between; align-items: center;">
      Divergence Mode: Cross-Model Contradiction Engine
      <span style="font-size: 0.75rem; padding: 0.3rem 0.6rem; background: rgba(124,124,124,0.1); border-radius: 12px; font-family: var(--font-mono); color: #7c7c7c; border: 1px solid rgba(124,124,124,0.2);">REALITY SYNTHESIS</span>
    </h2>
    <p style="margin-bottom: 1.5rem; font-size: 1rem; line-height: 1.5;">Divergence Mode runs your scenario through all three incompatible physics engines in parallel, then synthesizes a report on the core points of contradiction and narrative instability.</p>
    <div style="text-align: center; color: #7c7c7c; font-size: 0.85rem; font-family: var(--font-mono); padding-top: 1.2rem; border-top: 1px dashed rgba(124,124,124,0.2); animation: pulse 2s infinite;">» AWAITING CONFIGURATION. ENTER A TOPIC AND CLICK 'LAUNCH DIVERGENCE' TO GENERATE SYNTHESIS.</div>
  </div>
</div>
`;

const ROUTER_LOADING_STATE = `
<div style="padding: 2.5rem; max-width: 800px; margin: 2rem auto; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); position: relative; overflow: hidden;">
  <div class="dash-top"></div><div class="dash-right"></div><div class="dash-bottom"></div><div class="dash-left"></div>
  <div style="text-align: center; margin-bottom: 2.5rem; position: relative; z-index: 1;">
    <h2 style="margin: 0 0 0.5rem 0; color: var(--text-primary); font-size: 1.5rem; letter-spacing: 0.05em;">ROUTING DECISION QUERY</h2>
    <p style="margin: 0; color: var(--text-secondary); font-size: 0.95rem;">Classifying domain and selecting optimal reasoning reality type...</p>
  </div>
  <div style="text-align: center; margin-top: 2rem; color: #7c7c7c; font-size: 0.8rem; font-family: var(--font-mono); animation: pulse 1.5s infinite;">
    » CLASSIFYING DOMAIN >> SEARCHING SIMULATION PATHS...
  </div>
</div>
`;

const DIVERGENCE_LOADING_STATE = `
<div style="padding: 2.5rem; max-width: 800px; margin: 2rem auto; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); position: relative; overflow: hidden;">
  <div class="dash-top"></div><div class="dash-right"></div><div class="dash-bottom"></div><div class="dash-left"></div>
  <div style="text-align: center; margin-bottom: 2.5rem; position: relative; z-index: 1;">
    <h2 style="margin: 0 0 0.5rem 0; color: var(--text-primary); font-size: 1.5rem; letter-spacing: 0.05em;">DIVERGENCE SEQUENCE INITIATED</h2>
    <p style="margin: 0; color: var(--text-secondary); font-size: 0.95rem;">Evaluating contradictions across three incompatible simulation models in parallel...</p>
  </div>
  <div style="text-align: center; margin-top: 2rem; color: #7c7c7c; font-size: 0.8rem; font-family: var(--font-mono); animation: pulse 1.5s infinite;">
    » CRITICAL SYNTHESIS IN PROGRESS >> COMPUTING DIVERGENCE SIGNAL...
  </div>
</div>
`;

function mdToHtml(md) {
  if (!md) return '';
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, '<h3 style="color:#000;border-bottom:1px solid #ddd;padding-bottom:0.2rem;margin-top:1.2rem;margin-bottom:0.5rem;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="color:#000;border-bottom:1px solid #ccc;padding-bottom:0.3rem;margin-top:1.5rem;margin-bottom:0.6rem;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="color:#000;border-bottom:2px solid #000;padding-bottom:0.4rem;margin-top:1.8rem;margin-bottom:0.8rem;">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}

function renderDivergenceReport(reportText) {
  return `
    <div class="card winner" style="border: 2px solid #000; background: #fff; box-shadow: 8px 8px 0px #7c7c7c; padding: 2rem; width: 100%; box-sizing: border-box; margin: 1rem 0;">
      <h2 style="margin-top:0; border-bottom: 2px solid #000; padding-bottom: 0.5rem; color: #000; font-family: var(--font-mono); font-size: 1.4rem;">📡 REALITY DIVERGENCE REPORT</h2>
      <div style="font-family: var(--font-mono); font-size: 0.85rem; line-height: 1.6; margin-top: 1rem; color: #333; word-break: break-word;">
        ${mdToHtml(reportText)}
      </div>
    </div>
  `;
}

function renderEmptyState(targetMode) {
  const results = document.getElementById('results');
  let emptyStateHtml = COUNCIL_EMPTY_STATE;
  if (targetMode === 'mesh') emptyStateHtml = MESH_EMPTY_STATE;
  else if (targetMode === 'router') emptyStateHtml = ROUTER_EMPTY_STATE;
  else if (targetMode === 'divergence') emptyStateHtml = DIVERGENCE_EMPTY_STATE;

  results.innerHTML = `<div id="empty-state-container" style="position:relative; width:100%; min-height:calc(100vh - 2rem); display:flex;">${emptyStateHtml}</div>`;

  if (currentTutorialCleanup) {
    currentTutorialCleanup();
    currentTutorialCleanup = null;
  }

  setTimeout(() => {
    if (typeof initTutorialPhysics === 'function') {
      currentTutorialCleanup = initTutorialPhysics('tutorial-canvas', targetMode);
    }
  }, 10);
}

function setMode(mode) {
  currentMode = mode;
  _previousMode = null; // user made an explicit mode choice, clear profile back-nav

  const profilePage = document.getElementById('profile-page');
  const resultsDiv = document.getElementById('results');
  const treeMainPanel = document.getElementById('tree-main-panel');

  // This must happen unconditionally so any mode (mesh, council, tree) gets a clean slate.
  if (profilePage) profilePage.style.display = 'none';
  if (resultsDiv) resultsDiv.style.display = 'none';
  if (treeMainPanel) treeMainPanel.style.display = 'none';

  // ── Tree Mode: show tree panel, hide Council/Mesh panels ──────────
  const treeParams = document.getElementById('tree-params');
  const treeLaunchBtn = document.getElementById('tree-launch-btn');
  const councilParams = document.getElementById('council-params');

  if (mode === 'tree') {
    if (resultsDiv) resultsDiv.style.display = 'none';
    if (treeMainPanel) {
      treeMainPanel.classList.add('tree-active');
      treeMainPanel.style.display = 'block';
    }
    if (treeParams) treeParams.classList.add('visible');
    if (councilParams) councilParams.classList.add('hidden');
    if (meshParamsDiv) meshParamsDiv.classList.remove('visible');
    if (treeLaunchBtn) treeLaunchBtn.style.display = 'block';
    const btnRun = document.getElementById('btn-run');
    if (btnRun) btnRun.style.display = 'none';
    document.body.classList.remove('council-mode', 'mesh-mode');
    document.body.classList.add('tree-mode');
    if (customPersonaInput) {
      customPersonaInput.disabled = true;
      customPersonaInput.style.opacity = '0.4';
      customPersonaInput.style.cursor = 'not-allowed';
      if (document.getElementById('custom-persona-label')) {
        const btns = document.getElementById('custom-persona-label').querySelectorAll('button');
        btns.forEach(b => { b.disabled = true; b.style.opacity = '0.4'; b.style.cursor = 'not-allowed'; });
      }
    }
    if (typeof updateTreeForecast === 'function') {
      updateTreeForecast();
    }

    // Manage tree empty/loading/results state
    const flowCont = document.getElementById('tree-flow-content');
    if (flowCont) {
      flowCont.style.display = 'block';
      const resultsCont = document.getElementById('tree-results-container');

      if (_treeData) {
        // Results already rendered — nothing to do
        if (resultsCont) resultsCont.style.display = 'block';
      } else if (modeStatus.tree === 'loading') {
        // Simulation in flight — restore loading screen
        flowCont.style.padding = '1.2rem';
        flowCont.style.position = 'static';
        flowCont.style.minHeight = 'auto';
        flowCont.innerHTML = TREE_LOADING_STATE;
        if (resultsCont) resultsCont.style.display = 'none';
      } else {
        // Truly idle — show animated empty state
        flowCont.style.padding = '0';
        flowCont.style.position = 'relative';
        flowCont.style.minHeight = 'calc(100vh - 2rem)';
        flowCont.innerHTML = TREE_EMPTY_STATE;
        if (resultsCont) resultsCont.style.display = 'none';

        if (typeof currentTutorialCleanup === 'function') {
          currentTutorialCleanup();
          currentTutorialCleanup = null;
        }
        setTimeout(() => {
          const tutCanvas = document.getElementById('tree-physics-canvas');
          if (tutCanvas) {
            tutCanvas.width = flowCont.clientWidth;
            tutCanvas.height = flowCont.clientHeight;
          }
          if (typeof initTutorialPhysics === 'function') {
            currentTutorialCleanup = initTutorialPhysics('tree-physics-canvas', 'tree');
          }
        }, 50);
      }
    }

  } else {
    // Restore Council/Mesh panels
    if (resultsDiv) resultsDiv.style.display = 'block';
    if (treeMainPanel) {
      treeMainPanel.classList.remove('tree-active');
      treeMainPanel.style.display = 'none';
    }
    if (treeParams) treeParams.classList.remove('visible');
    if (treeLaunchBtn) treeLaunchBtn.style.display = 'none';
    const btnRun = document.getElementById('btn-run');
    if (btnRun) btnRun.style.display = '';
    document.body.classList.remove('tree-mode');
    if (customPersonaInput) {
      customPersonaInput.disabled = false;
      customPersonaInput.style.opacity = '1';
      customPersonaInput.style.cursor = 'text';
      if (document.getElementById('custom-persona-label')) {
        const btns = document.getElementById('custom-persona-label').querySelectorAll('button');
        btns.forEach(b => { b.disabled = false; b.style.opacity = '1'; b.style.cursor = 'pointer'; });
      }
    }
  }

  if (btnModeTree) btnModeTree.classList.toggle('active', mode === 'tree');
  if (btnModeCouncil) btnModeCouncil.classList.toggle('active', mode === 'council');
  if (btnModeMesh) btnModeMesh.classList.toggle('active', mode === 'mesh');
  if (btnModeRouter) btnModeRouter.classList.toggle('active', mode === 'router');
  if (btnModeAutomation) btnModeAutomation.classList.toggle('active', mode === 'divergence');

  if (mode === 'tree') return; // Council/Mesh-specific logic below does not apply

  // ── Council / Mesh / Router / Divergence: logic ───────────────────
  if (resultsDiv) resultsDiv.style.display = 'block';

  if (mode === 'mesh') {
    document.body.classList.add('mesh-mode');
    document.body.classList.remove('council-mode');
  } else if (mode === 'council') {
    document.body.classList.add('council-mode');
    document.body.classList.remove('mesh-mode');
  } else {
    document.body.classList.remove('council-mode', 'mesh-mode');
  }

  meshParamsDiv.classList.toggle('visible', mode === 'mesh');
  document.getElementById('council-params')?.classList.toggle('hidden', mode !== 'council');
  const divergenceParams = document.getElementById('divergence-params');
  if (divergenceParams) divergenceParams.style.display = (mode === 'divergence' || mode === 'router') ? 'block' : 'none';

  const hasResults = results.querySelector('.branch-card') || results.querySelector('.winner') || feedScroller.querySelector('.feed-post') || (currentPollJobId !== null);

  if (mode === 'mesh') {
    if (hasResults) {
      if (feedScroller.querySelector('.feed-post')) {
        meshFeedPanel.classList.add('visible');
      } else {
        meshFeedPanel.classList.remove('visible');
      }
    } else if (modeStatus.mesh === 'loading') {
      // Simulation in flight — keep loading UI as-is
    } else {
      meshFeedPanel.classList.remove('visible');
      renderEmptyState('mesh');
    }
  } else if (mode === 'council') {
    meshFeedPanel.classList.remove('visible');
    if (!hasResults && modeStatus.council !== 'loading') {
      renderEmptyState('council');
    }
  } else if (mode === 'router') {
    meshFeedPanel.classList.remove('visible');
    if (modeStatus.router !== 'loading') {
      renderEmptyState('router');
    }
  } else if (mode === 'divergence') {
    meshFeedPanel.classList.remove('visible');
    if (modeStatus.divergence !== 'loading') {
      renderEmptyState('divergence');
    }
  }

  const interviewPanel = document.getElementById('interview-panel');
  if (interviewPanel) {
    if (mode === 'council' && collectedInterviews.length > 0) {
      interviewPanel.classList.add('visible');
    } else {
      interviewPanel.classList.remove('visible');
    }
  }

  const customPersonaLabel = document.getElementById('custom-persona-label');
  if (customPersonaLabel) {
    customPersonaLabel.style.opacity = '1';
    customPersonaLabel.style.pointerEvents = 'auto';
    customPersonaLabel.title = '';
  }

  const btnRun = document.getElementById('btn-run');
  if (btnRun) {
    if (mode === 'mesh') btnRun.textContent = 'LAUNCH MESH';
    else if (mode === 'council') btnRun.textContent = 'LAUNCH COUNCIL';
    else if (mode === 'router') btnRun.textContent = 'Launch Router';
    else if (mode === 'divergence') btnRun.textContent = 'Launch Divergence';
  }

  logConsole(`MODE: ${mode.toUpperCase()} ACTIVATED`, 'system');
}

// ── Samples ──────────────────────────────────────────────────────────
const samples = {
  startup: {
    question: 'Should I quit my vibe coded software dream or invest more time by adding more features?',
    facts: ['I have a working prototype', 'I only have 2 months of runway', 'I do not know if people will pay', 'Users might want a cheaper option', 'Similar products already exists'],
    branchCount: '5', personaCount: '3'
  },
  career: {
    question: 'Should I quit my job and pursue a startup idea?',
    facts: ['The current role is stable, high pay but slow', 'I want more growth', 'I can survive for a few months building', 'My manager can change the role quickly', 'I have interviews lined up but i also have my own idea for an AI company'],
    branchCount: '6', personaCount: '3'
  },
  education: {
    question: 'Should I continue my PhD program or choose a different path?',
    facts: ['The Phd is scholarship but it drains me mentally', 'I need some practical knowledge', 'I seem overqualified for the roles i apply to, and underskilled for my desired roles', 'A teacher recommended I dont quit', 'I am unable to publish a paper'],
    branchCount: '5', personaCount: '4'
  },
  investment: {
    question: 'As a foreigner, should I use my entire savings to buy a house in Kocaeli,Turkey or just keep saving the money till its enough to move to Europe?',
    facts: ['The House is new and beautiful and within my budget', 'A single earthquake could take it all away', 'It would fast track a citizenship application', 'I have lived in Turkey for 6 years', 'Moving to europe means starting from 0', 'There are better tech jobs in europe', 'There is a possibility of a better life in an english speaking country'],
    branchCount: '6', personaCount: '4'
  },
  government: {
    question: 'Should my company expand operations now despite the ongoing war in the Middle East, or wait until regional policies stabilize?',
    facts: ['Conflict has disrupted supply chains', 'Local government is offering tax incentives to attract foreign investment', 'Security costs are rising', 'Analysts warn of prolonged instability', 'Competitors are delaying expansion plans'],
    branchCount: '5', personaCount: '5'
  },
  gambling: {
    question: 'Should I place a large bet on the upcoming football match or diversify my wagers across multiple games?',
    facts: ['I have won small bets consistently', 'My bankroll is limited', 'Odds are heavily favoring one team', 'Experts predict an upset is possible', 'Betting forums suggest spreading risk'],
    branchCount: '6', personaCount: '5'
  },
  marriage: {
    question: 'Should I marry my long-term partner now or wait until I am more financially stable?',
    facts: ['We have been together for 7 years', 'My partner wants to start a family soon', 'My income is currently unstable', 'Friends advise not to delay happiness', 'Financial advisors warn about added responsibilities'],
    branchCount: '5', personaCount: '6'
  }
};

function setSample(name) {
  const sample = samples[name];
  if (!sample) return;
  // Council/Mesh mapping
  questionInput.value = sample.question;
  factsInput.value = sample.facts.join('\n');
  customPersonaList = [''];
  currentCpIndex = 0;
  updateCpUi();
  branchCountInput.value = sample.branchCount;
  personaCountInput.value = sample.personaCount;

  // Tree mapping
  const treeDecision = document.getElementById('tree-decision');
  const treeContext = document.getElementById('tree-context');
  if (treeDecision) treeDecision.value = sample.question;
  if (treeContext) treeContext.value = sample.facts.join('\n');

  logConsole(`SCENARIO LOADED: ${name.toUpperCase()}`, 'info');
}

// ── Console logger ───────────────────────────────────────────────────
function logConsole(message, stage = 'SYSTEM') {
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-stage">[${(stage || 'SYSTEM').toUpperCase()}]</span> <span>${message}</span>`;
  statusEl.appendChild(line);
  statusEl.scrollTop = statusEl.scrollHeight;
}

function lineList(text) {
  return (text || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
}

// ── Job poller ───────────────────────────────────────────────────────
let currentPollJobId = null;
let currentPollEndpoint = null;
let printedAutomationLogsCount = 0;

async function cancelJob() {
  if (!currentPollJobId || !currentPollEndpoint) return;
  try {
    await fetch(`${currentPollEndpoint}/${currentPollJobId}`, { method: 'DELETE' });
  } catch (err) {
    console.error('Failed to cancel job', err);
  }
}
// ── Interview transcript collector ──────────────────────────────────
const collectedInterviews = [];

async function pollJob(jobId, endpoint = '/api/v4/jobs') {
  currentPollJobId = jobId;
  currentPollEndpoint = endpoint;
  let printedCount = 0;
  while (true) {
    const response = await fetch(`${endpoint}/${jobId}`);
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || 'Failed to load job');

    const qsEl = document.getElementById('queue-status');
    if (qsEl) {
      if (job.queuePosition > 0) qsEl.textContent = `[ QUEUE POSITION: ${job.queuePosition} ]`;
      else qsEl.textContent = '';
    }

    if (job.status === 'cancelled') {
      if (qsEl) qsEl.textContent = '';
      throw new Error('Simulation Cancelled by user.');
    }
    if (job.logs?.length) {
      const parsed = parseTelemetryFromLogs(job.logs, currentMode);
      currentTelemetry = {
        ...currentTelemetry,
        ...parsed,
        llmCallCount: job.llmCallCount || 0
      };
      updateTelemetryUI(currentTelemetry);

      if (job.logs.length > printedCount) {
        for (let i = printedCount; i < job.logs.length; i++) {
          const log = job.logs[i];
          logConsole(log.message, log.stage);
          // Collect interview transcripts
          if (log.stage === 'interview' && log.details) {
            collectedInterviews.push(log.details);
          }
        }
        printedCount = job.logs.length;
      }
    }
    if (job.status === 'done') {
      currentPollJobId = null;
      return job.result;
    }
    if (job.status === 'error') {
      currentPollJobId = null;
      throw new Error(job.error || 'Simulation failed');
    }
    await new Promise(r => setTimeout(r, 600));
  }
}

// ── Council renderers ──────────────────────────────────────────────────
function renderBranch(branch) {
  if (!branch) return '';
  const evidence = (branch.evidenceLinks || []).map(i => {
    if (!i) return '';
    return `<span class="chip">${i.title || i.id}</span>`;
  }).join('');
  const reactions = (branch.reaction || []).map(i => {
    if (!i) return '';
    const stance = i.stance || 'undecided';
    const stanceColor = stance === 'support' ? 'var(--accent-green)' : (stance === 'push back' || stance === 'pushback') ? 'var(--accent-orange)' : 'var(--text-secondary)';
    return `
      <div style="margin-bottom:8px">
        <div style="font-family:var(--font-mono);font-size:.75rem;">
          <strong>${i.name || 'Agent'}:</strong> 
          <span style="color:${stanceColor}; font-weight:bold;">${stance.toUpperCase()}</span>
        </div>
        ${i.text ? `<div style="font-size:.8rem; color:var(--text-secondary); margin-top:3px; line-height:1.3;">"${i.text}"</div>` : ''}
      </div>
    `;
  }).join('');
  const objections = (branch.objections || []).map(i => {
    if (!i) return '';
    return `<li>${i}</li>`;
  }).join('');
  return `
    <div class="card branch-card stagger-enter ${branch.rank === 'best' ? 'winner' : ''}" data-branch-id="${branch.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem">
        <h3 style="margin:0;font-size:1.1rem">${branch.title}</h3>
        <span class="score">${branch.score}</span>
      </div>
      <p style="font-size:.9rem;margin-bottom:1rem">${branch.description}</p>
      <p style="font-family:var(--font-mono);font-size:.75rem;color:var(--accent-orange);margin-bottom:1rem">// ACTION: ${branch.action}</p>
      <div class="chips">${evidence}</div>
      <div style="margin-top:1rem">
        <div class="status" style="font-size:.65rem;margin-bottom:.5rem">STAKEHOLDER DELIBERATION</div>
        ${reactions}
      </div>
      <div style="margin-top:1rem">
        <div class="status" style="font-size:.65rem;margin-bottom:.5rem">CRITICAL OBJECTIONS</div>
        <ul class="compact-list">${objections}</ul>
      </div>
      <div style="margin-top:1.5rem; display:flex; flex-direction:column; gap:0.5rem;">
        <input type="text" id="counter-input-${branch.id}" placeholder="Provide counter-evidence or argument..." style="width:100%; padding:0.5rem; border:1px solid #CCC; border-radius:4px; font-size:0.85rem;" />
        <div style="display:flex; gap:0.5rem;">
          <button class="primary" style="flex:1; padding:0.5rem; font-weight:bold; letter-spacing:0.05em;" data-resimulate-branch="${branch.id}">RE-SIMULATE</button>
          <button class="ghost" style="padding:0.5rem; display:flex; align-items:center; justify-content:center; background:#EEE; border-radius:4px;" data-record-outcome="${branch.id}" title="Record Outcome">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderResults(result) {
  const rawBranches = result.branches || [];
  const validBranches = rawBranches.filter((b, i) => {
    if (!b) { console.error(`[renderResults] branch at index ${i} is undefined/null — skipping render.`); return false; }
    return true;
  });
  const branches = validBranches.map(renderBranch).join('');
  const facts = (result.scenario?.facts || []).map(f => `<li>${f}</li>`).join('');
  return `
    <div class="card winner stagger-enter">
      <div class="status" style="color:var(--accent-green)">STRATEGIC DIRECTIVE</div>
      <h2 style="font-size:2rem;color:var(--text-dark);margin:1rem 0">${result.recommendation?.title}</h2>
      <p style="font-size:1.1rem;color:var(--text-secondary);width:100%">${result.recommendation?.reason}</p>
      <div style="margin-top:2rem;border-top:1px solid #CCC;padding-top:1rem">
        <div class="status" style="font-size:.7rem;color:var(--accent-orange)">COUNCILAL VULNERABILITY</div>
        <p style="font-family:var(--font-mono);font-size:.9rem">${result.recommendation?.whatWouldChangeMyMind}</p>
      </div>
    </div>
    <div class="grid">
      <section class="card stagger-enter" style="display: flex; flex-direction: column; justify-content: space-between; height: 100%; min-height: 900px; max-height: 900px;">
        <div style="display: flex; flex-direction: column; overflow: hidden; flex: 1;">
          <h2>COUNTERFACTUAL ENGINE</h2>
          <div style="font-size:0.85rem; margin-bottom:1rem; color:var(--text-secondary); font-style:italic;">
            What future would most likely happen if the user is wrong?
          </div>
          <div style="overflow-y:auto; padding-right:0.25rem; flex: 1;">
            ${(result.counterfactuals?.branchConsequences || []).map(c => {
              if (!c) return '';
              return `
              <div style="margin-bottom:1rem; padding-bottom:1rem; border-bottom:1px solid #EEE;">
                <div style="font-weight:bold; color:var(--text-dark); margin-bottom:0.3rem;">If you ${(c.title || 'N/A').toLowerCase()} and are wrong:</div>
                <ul style="margin:0; padding-left:1.2rem; font-size:0.9rem; color:var(--text-secondary); list-style-type: '→ ';">
                  ${(c.ifWrongConsequence || 'No data provided.').split('\\n').filter(Boolean).map(l => `<li>${l.replace(/^[-*•]\\s*/, '')}</li>`).join('')}
                </ul>
              </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <div style="margin-top:1.5rem; border-top:1px solid #EEE; padding-top:1rem;">
          <div style="margin-bottom:1rem;">
            <div style="font-size:0.75rem; color:var(--accent-orange); text-transform:uppercase; font-weight:bold;">Most Expensive Incorrect Assumption</div>
            <div style="font-weight:bold; font-size:0.95rem; margin-top:0.2rem;">"${result.counterfactuals?.mostExpensiveAssumption || 'N/A'}"</div>
          </div>
          <div style="margin-bottom:0.5rem;">
            <div style="font-size:0.75rem; color:var(--accent-green); text-transform:uppercase; font-weight:bold;">Most Survivable Failure</div>
            <div style="font-weight:bold; font-size:0.95rem; margin-top:0.2rem;">${result.counterfactuals?.mostSurvivableFailure || 'N/A'}</div>
          </div>
        </div>
      </section>
      <section class="card stagger-enter" style="display: flex; flex-direction: column; height: 100%; min-height: 900px; max-height: 900px; overflow: hidden;">
        <h2>MESH TOPOLOGY</h2>
        <div class="viz-wrap" id="population-viz" style="margin-top: 0.5rem; margin-bottom: 1rem;"></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:1rem; overflow-y:auto; padding-right:0.25rem; flex:1;">
          ${(result.population?.personas || []).map(p => `
            <div style="border:1px solid #EEE;padding:.8rem;border-radius:6px;background:#FAFAFA;">
              <div style="font-size:1.05rem;color:var(--accent-orange);font-weight:700">${p.name || 'Agent'}</div>
              <div style="font-family:var(--font-mono);font-size:.65rem;color:#888;margin-top:0.2rem;margin-bottom:0.6rem;text-transform:uppercase;">
                ${[p.age, p.gender, p.race, p.location].filter(Boolean).join(' • ')}
              </div>
              <div style="font-size:0.8rem; font-weight:bold; margin-bottom:0.4rem; color:var(--text-dark);">
                ${p.expertise || (p.cluster || 'balanced').toUpperCase()}
              </div>
              <div style="font-size:0.85rem; line-height:1.4; color:var(--text-secondary);">${p.bio || p.lens || p.note || ''}</div>
            </div>
          `).join('')}
        </div>
      </section>
    </div>
    <div class="branches" style="margin-top:2rem">${branches}</div>
  `;
}

async function rerender(result) {
  currentCouncilSimId = result.id;
  results.innerHTML = renderResults(result);
  try {
    const popTarget = document.getElementById('population-viz');
    if (popTarget) popTarget.innerHTML = renderPopulationSvg(result.population.personas, result.recommendation?.branchId);
  } catch (e) { console.error(e); }
  results.querySelectorAll('[data-record-outcome]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.recordOutcome;
      logConsole(`RECORDING OUTCOME FOR BRANCH: ${id}`, 'system');
      await fetch(`/api/v4/runs/${result.id}/outcome`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: id, success: id === result.recommendation.branchId })
      });

      logConsole(`INGESTING BRANCH KNOWLEDGE INTO MEMTRACE...`, 'system');
      try {
        const ingestRes = await fetch(`/api/v4/runs/${result.id}/branches/${id}/ingest`, { method: 'POST' });
          if (ingestRes.ok) {
            logConsole(`SUCCESS: Branch ${id} saved to Knowledge Graph.`, 'system');
            btn.style.background = '#4CAF50';
            btn.style.color = 'white';
          } else {
            const ingestErr = await ingestRes.json().catch(() => ({ error: 'unknown' }));
            logConsole(`FAILED: Branch ingest failed — ${ingestErr.error}`, 'error');
          }
      } catch (err) {
        logConsole(`INGEST ERROR: ${err.message}`, 'error');
      }

      refreshRuns();
    });
  });

  results.querySelectorAll('[data-resimulate-branch]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (currentMode !== 'council') {
        console.warn("Re-simulate is only allowed in Council mode.");
        return;
      }
      const branchId = btn.dataset.resimulateBranch;
      const inputEl = document.getElementById(`counter-input-${branchId}`);
      const newEvidence = inputEl ? inputEl.value.trim() : '';

      if (!newEvidence) {
        alert("Please provide a counter-argument or new evidence to re-simulate this branch.");
        return;
      }

      btn.innerText = 'SIMULATING...';
      btn.disabled = true;
      logConsole(`RESIMULATING BRANCH: ${branchId} WITH NEW EVIDENCE`, 'system');

      try {
        const response = await fetch(`/api/v4/runs/${result.id}/branches/${branchId}/resimulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newEvidence })
        });
        const resJob = await response.json();
        if (!response.ok) throw new Error(resJob.error || 'Resimulation failed');

        logConsole(`RESIMULATION QUEUED: ${resJob.jobId}`, 'system');
        const finalResult = await pollJob(resJob.jobId, '/api/v4/jobs');
        logConsole('RESIMULATION COMPLETE.', 'success');
        
        if (finalResult.recommendation) result.recommendation = finalResult.recommendation;
        if (finalResult.counterfactuals) result.counterfactuals = finalResult.counterfactuals;
        if (finalResult.allBranches && finalResult.allBranches.length > 0) {
          result.branches = finalResult.allBranches;
        } else if (finalResult.updatedBranch) {
          const bIndex = result.branches.findIndex(b => b.id === branchId);
          if (bIndex >= 0) result.branches[bIndex] = finalResult.updatedBranch;
        }
        await rerender(result);
      } catch (err) {
        logConsole(`RESIMULATION ERROR: ${err.message}`, 'error');
        btn.innerText = 'RE-SIMULATE';
        btn.disabled = false;
      }
    });
  });
}

// ── Interview Panel Renderer ─────────────────────────────────────────
function renderInterviewPanel(interviews) {
  const panel = document.getElementById('interview-panel');
  const log = document.getElementById('interview-log');
  if (!panel || !log) return;

  if ((currentMode !== 'council' && currentMode !== 'divergence') || !interviews || interviews.length === 0) {
    panel.classList.remove('visible');
    return;
  }

  panel.classList.add('visible');
  log.innerHTML = interviews.map(iv => {
    const stanceCls = iv.finalStance === 'support' ? 'interview-stance-support' : 'interview-stance-pushback';
    const stanceLabel = (iv.finalStance || 'undecided').toUpperCase();
    return `
      <div class="interview-card">
        <div class="interview-card-header">
          <span class="interview-name">${esc(iv.personaName)}</span>
          <span class="interview-branch">on branch: ${esc(iv.branchTitle)}</span>
          <span class="${stanceCls}">\u2192 ${stanceLabel}</span>
        </div>
        ${iv.judgeQuestion ? `
          <div class="interview-row">
            <div class="interview-label" style="color:var(--text-accent);">JUDGE's CROSS-EXAMINATION</div>
            <div style="color:var(--text-secondary);font-style:italic;">"${esc(iv.judgeQuestion)}"</div>
          </div>` : ''}
        ${iv.personaResponse ? `
          <div class="interview-row">
            <div class="interview-label">${esc(iv.personaName)}'S RESPONSE</div>
            <div style="font-weight:500;">${esc(iv.personaResponse)}</div>
          </div>` : ''}
      </div>
    `;
  }).join('');
}

// ── Mesh renderers ──────────────────────────────────────────────────
const PLATFORM_COLORS = {
  twitter: '#6cb2f7', reddit: '#ff7043', hn: '#ff9800', discord: '#9c88ff', market: '#66bb6a', facebook: '#1877F2'
};

function renderMeshResults(result) {
  const report = result.report || {};
  const verdict = report.verdict || {};
  const topInfl = (report.topInfluencers || []).slice(0, 5);
  const platData = report.platformBreakdown || {};
  const hashtags = report.hashtags || [];
  const dailySpeakers = report.dailySpeakers || {};
  const interviews = report.interviews || [];
  const interviewSynthesis = report.interviewSynthesis || '';

  const platformChips = Object.entries(platData).map(([p, d]) => `
    <span class="platform-chip" style="background:#121212;border:1px solid ${PLATFORM_COLORS[p] || '#888'};color:${PLATFORM_COLORS[p] || '#888'}">
      ${p.toUpperCase()} · ${d.agentCount} agents · pos: ${d.avgPosition > 0 ? '+' : ''}${d.avgPosition}
    </span>
  `).join('');

  const agentCards = (result.agents || []).map(a => {
    const badges = Array.isArray(a.platforms)
      ? a.platforms.map(p => `<div class="feed-platform-badge ${p}" style="display:inline-block; margin-right:2px; margin-bottom:2px;">${p.toUpperCase()}</div>`).join('')
      : `<div class="feed-platform-badge ${a.platform}">${(a.platform || '').toUpperCase()}</div>`;
    return `
      <div class="agent-card" data-agent-id="${a.id}" data-sim-id="${result.id}">
        <div style="display:flex; flex-wrap:wrap; gap:2px; margin-bottom:0.4rem;">${badges}</div>
        <div style="font-weight:700;font-size:.85rem;margin:.4rem 0;color:var(--accent-orange)">${a.name}</div>
        <div style="font-size:.7rem;color:var(--text-secondary);font-family:var(--font-mono)">${(a.cluster || 'balanced').toUpperCase()}</div>
        <button class="ghost tiny" style="width:100%;margin-top:.5rem;font-size:.6rem"
          data-chat-agent="${a.id}" data-chat-name="${a.name}" data-sim-id="${result.id}">CHAT</button>
      </div>
    `;
  }).join('');

  const influencerRows = topInfl.map((inf, i) => `
    <div style="display:flex;align-items:center;gap:.6rem;padding:.4rem 0;border-bottom:1px solid var(--border)">
      <span style="font-family:var(--font-mono);font-size:.7rem;color:var(--text-secondary)">#${i + 1}</span>
      <span class="feed-platform-badge ${inf.platform}">${inf.platform}</span>
      <span style="font-weight:700;font-size:.82rem;color:var(--accent-orange);flex:1">${inf.name}</span>
      <span style="font-family:var(--font-mono);font-size:.7rem">${inf.reactionsReceived} reactions</span>
    </div>
  `).join('');

  // Build trending tags: prefer real #hashtags from agent content, pad with keywords if < 10
  const rawHashtags = report.hashtags || [];
  const rawKeywords = report.keywords || [];
  const trendingTags = rawHashtags.length >= 10
    ? rawHashtags.slice(0, 12)
    : [...rawHashtags, ...rawKeywords.filter(k => !rawHashtags.includes(k))].slice(0, 12);

  const hashtagsHTML = trendingTags.length
    ? trendingTags.map(tag => {
      const isReal = tag.startsWith('#');
      return `<span style="display:inline-block;padding:.2rem .5rem;background:${isReal ? 'rgba(0,240,255,0.07)' : 'rgba(255,255,255,.04)'};border:1px solid ${isReal ? 'rgba(0,240,255,.25)' : 'rgba(255,255,255,.1)'};border-radius:4px;font-size:.72rem;font-family:var(--font-mono);margin:.2rem;color:${isReal ? 'var(--accent-cyan)' : 'var(--text-secondary)'}">${tag}</span>`;
    }).join('')
    : '<p style="color:var(--text-secondary);font-size:.82rem;font-style:italic">No topics extracted.</p>';

  const daysHTML = Object.entries(dailySpeakers).map(([day, list]) => {
    // Show all speech events (up to 30) to ensure platforms like HN aren't truncated
    const speakersList = list.slice(0, 30).map(sp => `
      <div style="display:flex;align-items:center;gap:.4rem;padding:.2rem 0;font-size:.72rem">
        <span style="color:#888;font-family:var(--font-mono);font-size:.65rem">${sp.time}</span>
        <span style="font-weight:600;color:var(--accent-orange)">${sp.agentName}</span>
        <span class="feed-platform-badge ${sp.platform}" style="padding:.1rem .3rem;font-size:.6rem">${sp.platform}</span>
        <span style="font-family:var(--font-mono);font-size:.65rem;color:#666">${sp.type.toUpperCase()}</span>
      </div>
    `).join('');

    return `
      <div style="margin-top:.6rem; border-top: 1px solid rgba(255,255,255,.05); padding-top:.5rem">
        <div style="font-weight:700;font-size:.75rem;color:var(--accent-orange);margin-bottom:.3rem">${day}</div>
        <div style="display:flex;flex-direction:column;gap:.25rem;max-height:150px;overflow-y:auto">
          ${speakersList || '<p style="color:#666;font-size:.7rem;font-style:italic">No activity.</p>'}
        </div>
      </div>
    `;
  }).join('');

  let col = '#ff9800';
  const stanceLower = String(verdict.stance || '').toLowerCase();
  if (stanceLower.includes('approved') || stanceLower.includes('go')) col = '#4caf85';
  else if (stanceLower.includes('denied') || stanceLower.includes('abort')) col = '#e05c5c';
  else if (stanceLower.includes('deadlock')) col = '#d25ce0';
  else if (stanceLower.includes('supportive')) col = '#81c784';
  else if (stanceLower.includes('skeptical')) col = '#e57373';
  else if (verdict.avgPosition > 0.2) col = '#4caf85';
  else if (verdict.avgPosition < -0.2) col = '#e05c5c';


  let loudestConcernHTML = '';
  if (verdict.loudestConcern) {
    loudestConcernHTML = `
      <div style="margin-top:0.8rem; padding:0.6rem; background:rgba(224,92,92,0.06); border-left:3px solid #e05c5c; border-radius:0 4px 4px 0; font-size:0.8rem;">
        <span style="color:#e05c5c; font-weight:700; font-family:var(--font-mono); text-transform:uppercase; font-size:0.65rem; display:block; margin-bottom:0.15rem;">Loudest Concern / Countering Voice</span>
        <strong style="color:var(--text-primary);">${esc(verdict.loudestConcern.name)}</strong> (${verdict.loudestConcern.platform.toUpperCase()}) holds an opposing position of <strong style="color:#e05c5c;">${verdict.loudestConcern.position > 0 ? '+' : ''}${verdict.loudestConcern.position.toFixed(2)}</strong>:
        <span style="color:var(--text-secondary); font-style:italic;">"${esc(verdict.loudestConcern.concern)}"</span>
      </div>
    `;
  }

  let topAlternativeHTML = '';
  if (verdict.topAlternative) {
    topAlternativeHTML = `
      <div style="margin-top:0.6rem; padding:0.6rem; background:rgba(0,240,255,0.04); border-left:3px solid #00F0FF; border-radius:0 4px 4px 0; font-size:0.8rem;">
        <span style="color:#00F0FF; font-weight:700; font-family:var(--font-mono); text-transform:uppercase; font-size:0.65rem; display:block; margin-bottom:0.15rem;">Top Alternative Strategy (Next Best Branch)</span>
        <strong style="color:var(--text-primary);">${esc(verdict.topAlternative.title)}</strong> · Probability: <strong style="color:#00F0FF;">${verdict.topAlternative.probability}%</strong> (Score: ${verdict.topAlternative.score}/100)
        <p style="margin:0.15rem 0 0 0; color:var(--text-secondary); font-size:0.75rem;">${esc(verdict.topAlternative.description)}</p>
      </div>
    `;
  }

  return `
    <div class="verdict-card stagger-enter">
      <div class="status" style="font-size:.7rem;margin-bottom:.4rem">MESH INTELLIGENCE VERDICT</div>
      <h2 style="font-size:1.8rem;margin:.4rem 0;color:${col}">${(verdict.stance || 'unknown').replace(/_/g, ' ').toUpperCase()}</h2>
      <p style="font-size:1rem;color:var(--text-secondary);max-width:none">${verdict.summary || ''}</p>
      
      ${loudestConcernHTML}
      ${topAlternativeHTML}
      
      <div style="display:flex;gap:1.5rem;margin-top:1rem;font-family:var(--font-mono);font-size:.75rem">
        <span>AVG: <strong style="color:${col}">${verdict.avgPosition > 0 ? '+' : ''}${verdict.avgPosition}</strong></span>
        <span>POLARIZATION: <strong>${verdict.polarization}</strong></span>
        <span>CONFIDENCE: <strong>${verdict.confidence}%</strong></span>
        <span>${result.agentCount} AGENTS · ${result.tickCount} TICKS · ${result.interactions?.length || 0} INTERACTIONS</span>
      </div>
      <div class="platform-grid">${platformChips}</div>
    </div>
    <div class="grid" style="margin-top:1.5rem; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));">
      <section class="card stagger-enter">
        <h2>TOP INFLUENCERS</h2>
        ${influencerRows || '<p style="color:var(--text-secondary);font-size:.82rem">No data yet.</p>'}
      </section>
      <section class="card stagger-enter" style="max-height: 500px; overflow-y: auto;">
        <h2>TOPICS & SPEECH TIMELINE</h2>
        <div style="margin-bottom:1rem">
          <div style="font-size:.7rem;color:var(--text-secondary);margin-bottom:.4rem;text-transform:uppercase;font-family:var(--font-mono)">Trending Keywords / Tags</div>
          <div style="display:flex;flex-wrap:wrap;gap:.25rem">
            ${hashtagsHTML}
          </div>
        </div>
        <div>
          <div style="font-size:.7rem;color:var(--text-secondary);margin-bottom:.2rem;text-transform:uppercase;font-family:var(--font-mono)">Daily Chronological Timeline</div>
          ${daysHTML || '<p style="color:var(--text-secondary);font-size:.82rem;font-style:italic">Timeline empty.</p>'}
        </div>
      </section>
      <section class="card stagger-enter" style="max-height: 500px; overflow: hidden; display: flex; flex-direction: column;">
        <h2>RELATIONS GRAPH</h2>
        <div id="relations-graph-container" style="flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden;">
          ${renderRelationsGraphSvg(result.agents, result.graph?.edges || [])}
        </div>
        <div id="graph-details-panel" style="margin-top:0.4rem; padding-top:0.4rem; border-top:1px dashed var(--border-color); font-size:0.68rem; line-height:1.3; height:120px; min-height:120px; overflow-y:auto; font-family:var(--font-mono); color:var(--text-secondary);">
          Hover on any node to view persona details.
        </div>
      </section>
    </div>
    
    ${(() => {
      let interviewsHTML = '';
      if (interviews.length > 0 || interviewSynthesis) {
        const ivsHTML = interviews.map(iv => {
          const agentName = iv.agentName || iv.personaName || 'Agent';
          const faction = iv.faction || iv.branchTitle || 'N/A';
          return (iv.turns || []).map((turn, tIdx) => {
            return `
              <div class="interview-card" style="padding:0.6rem; border:1px solid rgba(255,255,255,0.05); border-radius:4px; background:rgba(255,255,255,0.01); display:flex; flex-direction:column; gap:0.3rem; margin-bottom:0.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-family:var(--font-mono); font-size:0.7rem;">
                  <span><strong style="color:var(--accent-orange);">${esc(agentName)}</strong> (Faction: <strong style="color:var(--text-primary);">${esc(faction)}</strong>) · Turn ${tIdx + 1}</span>
                </div>
                <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.15rem;">
                  <strong>Q:</strong> ${esc(turn.question)}
                </div>
                <div style="font-size:0.78rem; line-height:1.4; color:var(--text-primary);">
                  <strong>A:</strong> "${esc(turn.answer)}"
                </div>
              </div>
            `;
          }).join('');
        }).join('');

        interviewsHTML = `
          <section class="card stagger-enter" style="margin-top:1.5rem;">
            <h2>POST-SIMULATION QUALITATIVE DELIBERATION</h2>
            ${interviewSynthesis ? `
              <div style="padding:0.8rem; background:rgba(156,136,255,0.05); border-left:3px solid #9c88ff; border-radius:0 4px 4px 0; font-size:0.82rem; margin-bottom:1rem; line-height:1.5; color:var(--text-primary);">
                <span style="color:#9c88ff; font-weight:700; font-family:var(--font-mono); text-transform:uppercase; font-size:0.65rem; display:block; margin-bottom:0.25rem;">Qualitative Consensus Synthesis</span>
                ${esc(interviewSynthesis)}
              </div>
            ` : ''}
            <div style="display:flex; flex-direction:column; gap:0.4rem; max-height:450px; overflow-y:auto; padding-right:0.2rem;">
              ${ivsHTML || '<p style="color:var(--text-secondary); font-size:0.8rem; font-style:italic;">No interviews conducted.</p>'}
            </div>
          </section>
        `;
      }
      return interviewsHTML;
    })()}

    <section class="card stagger-enter" style="margin-top:1.5rem">
      <h2>AGENT ROSTER — click any card to inspect · CHAT to talk directly</h2>
      <div class="agent-grid">${agentCards}</div>
    </section>
  `;
}

function renderFeed(interactions, roundSummaries = []) {
  feedScroller.innerHTML = '';

  // Build a map: roundNumber → roundSummary (for injecting dividers before each round's first event)
  const roundStartTick = {};
  for (const rs of roundSummaries) {
    roundStartTick[rs.round] = rs;
  }

  // Group interactions by tick (round) to inject dividers
  const ticksSeen = new Set();

  for (const e of interactions) {
    const tick = e.tick;
    if (!ticksSeen.has(tick)) {
      ticksSeen.add(tick);
      const rs = roundStartTick[tick];
      // Inject round divider
      const divider = document.createElement('div');
      divider.className = 'feed-round-divider';
      const shockHTML = rs?.shockEvent
        ? `<span style="color:#e05c5c;font-weight:700;">[SHOCK] ${esc(rs.shockEvent.title)}</span><span style="color:#aaa;font-size:.65rem;"> — ${esc(rs.shockEvent.description)}</span>`
        : `<span style="color:#4caf85;font-size:.68rem;">No shock injection — control trajectory</span>`;
      divider.innerHTML = `
        <div style="display:flex;align-items:center;gap:.5rem;padding:.5rem 0;margin:.3rem 0;border-top:1px solid rgba(255,255,255,0.08);border-bottom:1px solid rgba(255,255,255,0.08);">
          <span style="font-family:var(--font-mono);font-size:.65rem;color:var(--accent-cyan);font-weight:700;white-space:nowrap;">TICK ${tick}</span>
          <div style="flex:1;display:flex;flex-direction:column;gap:.1rem;">
            ${shockHTML}
          </div>
        </div>
      `;
      feedScroller.appendChild(divider);
    }

    const isReaction = e.type !== 'post';
    const div = document.createElement('div');
    div.className = `feed-post type-${e.type} ${isReaction ? 'feed-reaction' : ''}`;
    div.innerHTML = `
      <div class="feed-post-meta">
        <span class="feed-agent-name">${e.agent_name || e.agentName || 'Agent'}</span>
        <span class="feed-platform-badge ${e.platform || ''}">${(e.platform || '').toUpperCase()}</span>
        <span class="feed-tick">TICK ${e.tick}</span>
        <span style="font-size:.6rem;font-family:var(--font-mono);color:#666">${(e.type || '').toUpperCase()}</span>
      </div>
      <div class="feed-post-text">${e.content || ''}</div>
    `;
    feedScroller.appendChild(div);
  }
  feedScroller.scrollTop = feedScroller.scrollHeight;
}

function initRelationsGraphHover(agents = []) {
  const svg = document.getElementById('relations-svg');
  if (!svg) return;
  const nodes = svg.querySelectorAll('.graph-node');
  const edges = svg.querySelectorAll('.graph-edge');
  const detailsPanel = document.getElementById('graph-details-panel');

  nodes.forEach(node => {
    node.addEventListener('mouseenter', () => {
      node.title = ""; // explicitly disable native tooltip
      const id = node.dataset.agentId;
      const agent = agents.find(a => a.id === id);
      if (agent && detailsPanel) {
        const platformsStr = Array.isArray(agent.platforms)
          ? agent.platforms.map(p => p.toUpperCase()).join(', ')
          : esc((agent.platform || '').toUpperCase());
        detailsPanel.innerHTML = `
          <strong style="color:var(--accent-orange);">${esc(agent.name)}</strong> (${platformsStr}) · <span style="color:#aaa;">${(agent.cluster || 'balanced').toUpperCase()}</span><br>
          <span style="font-style:italic;color:#888;">"${esc(agent.backstory || '')}"</span>
        `;
      }
      nodes.forEach(n => {
        if (n.dataset.agentId === id) {
          n.style.opacity = '1';
        } else {
          n.style.opacity = '0.15';
        }
      });
      edges.forEach(e => {
        if (e.dataset.src === id || e.dataset.dst === id) {
          e.style.opacity = '0.9';
          const origWidth = parseFloat(e.dataset.origStrokeWidth || '1');
          e.style.strokeWidth = `${origWidth * 1.8}px`;
        } else {
          e.style.opacity = '0.03';
        }
      });
    });

    node.addEventListener('mouseleave', () => {
      if (detailsPanel) {
        detailsPanel.innerHTML = `Hover on any node to view persona details.`;
      }
      nodes.forEach(n => {
        n.style.opacity = '1';
      });
      edges.forEach(e => {
        e.style.opacity = '0.35';
        e.style.strokeWidth = `${e.dataset.origStrokeWidth || '1'}px`;
      });
    });
  });
}

// ── Agent Inspector ──────────────────────────────────────────────────
function openInspector(agentId, simId) {
  fetch(`/api/v4/mesh/${simId}/agent/${agentId}`)
    .then(r => r.json())
    .then(data => {
      if (data.error) throw new Error(data.error);
      const { agent, feed } = data;
      const beliefs = agent.beliefs?.positions || {};
      const allBeliefEntries = Object.entries(beliefs);
      // Separate by sign — positives stay positive, negatives stay negative
      const positives = allBeliefEntries.filter(([, v]) => v >= 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const negatives = allBeliefEntries.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 5);
      const top5 = positives;
      const uniqueBottom5 = negatives;

      function beliefBar([topic, val]) {
        const pct = Math.abs(val) * 100;
        const cls = val >= 0 ? 'belief-positive' : 'belief-negative';
        return `
          <div class="belief-bar">
            <span style="width:90px;font-family:var(--font-mono);font-size:.65rem;flex-shrink:0">${topic.replace(/_/g, ' ')}</span>
            <div class="belief-bar-track">
              <div class="belief-bar-fill ${cls}" style="width:${pct.toFixed(0)}%"></div>
            </div>
            <span style="font-family:var(--font-mono);font-size:.65rem;width:40px;text-align:right">${val > 0 ? '+' : ''}${val.toFixed(2)}</span>
          </div>`;
      }

      const top5HTML = top5.map(beliefBar).join('');
      const bottom5HTML = uniqueBottom5.map(beliefBar).join('');
      const beliefBars = [
        top5HTML ? `<div style="font-size:.6rem;color:var(--accent-green);font-family:var(--font-mono);margin-bottom:.3rem;text-transform:uppercase">STRONGEST BELIEFS</div>${top5HTML}` : '',
        uniqueBottom5.length ? `<div style="font-size:.6rem;color:var(--accent-orange);font-family:var(--font-mono);margin:.6rem 0 .3rem;text-transform:uppercase">WEAKEST / OPPOSING</div>${bottom5HTML}` : '',
      ].join('');

      const recentPosts = (feed || []).slice(-5).reverse().map(e => `
        <div style="border-left:2px solid var(--border);padding:.4rem .6rem;margin:.4rem 0;font-size:.75rem">
          <span style="font-family:var(--font-mono);font-size:.6rem;color:var(--text-secondary)">${(e.type || '').toUpperCase()} · TICK ${e.tick}</span><br>
          ${(e.content || '').slice(0, 200)}
        </div>`).join('');

      const inspectorBadges = Array.isArray(agent.platforms)
        ? agent.platforms.map(p => `<div class="feed-platform-badge ${p}" style="margin-bottom:.8rem; margin-right:4px; display:inline-block;">${p.toUpperCase()}</div>`).join('')
        : `<div class="feed-platform-badge ${agent.platform || ''}" style="margin-bottom:.8rem; display:inline-block;">${(agent.platform || '').toUpperCase()}</div>`;

      inspectorContent.innerHTML = `
        ${inspectorBadges}
        <h2 style="font-size:1.3rem;color:var(--accent-orange);margin:.3rem 0">${agent.name}</h2>
        <div style="font-family:var(--font-mono);font-size:.7rem;color:var(--text-secondary);margin-bottom:1rem">${(agent.cluster || 'balanced').toUpperCase()}</div>
        <p style="font-size:.82rem;margin-bottom:1.2rem;color:var(--text-secondary)">${agent.backstory || ''}</p>
        <div class="status" style="font-size:.65rem;margin-bottom:.5rem">BELIEF STATE</div>
        ${beliefBars || '<p style="font-size:.75rem;color:var(--text-secondary)">No belief data yet.</p>'}
        ${recentPosts ? `<div class="status" style="font-size:.65rem;margin-top:1.2rem;margin-bottom:.5rem">RECENT POSTS</div>${recentPosts}` : ''}
        <button class="ghost tiny" style="width:100%;margin-top:1rem"
          data-chat-agent="${agent.id}" data-chat-name="${agent.name}" data-sim-id="${agent.simId}">
          CHAT WITH ${agent.name.toUpperCase()}
        </button>
      `;
      inspector.classList.add('open');
      inspectorContent.querySelector('[data-chat-agent]')?.addEventListener('click', openChatModal);
    })
    .catch(e => logConsole(`Inspector error: ${e.message}`, 'error'));
}

document.getElementById('inspector-close').addEventListener('click', () => {
  inspector.classList.remove('open');
});

// ── Chat modal ───────────────────────────────────────────────────────
function openChatModal(e) {
  const btn = e.currentTarget;
  currentChatAgent = {
    id: btn.dataset.chatAgent,
    name: btn.dataset.chatName,
    simId: btn.dataset.simId || currentMeshSimId,
  };
  chatAgentName.textContent = currentChatAgent.name;
  chatHistory.innerHTML = '';
  chatModal.classList.add('open');
  chatInput.focus();

  if (!chatHistoriesByAgent[currentChatAgent.id]) {
    chatHistoriesByAgent[currentChatAgent.id] = [];
  } else {
    chatHistoriesByAgent[currentChatAgent.id].forEach(msg => {
      appendChatMsg(msg.text, msg.who, false);
    });
  }
}

document.getElementById('chat-close').addEventListener('click', () => chatModal.classList.remove('open'));
document.getElementById('chat-send').addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });

async function sendChatMessage() {
  const msg = chatInput.value.trim();
  if (!msg || !currentChatAgent) return;
  chatInput.value = '';
  appendChatMsg(msg, 'user');

  // Show typing indicator
  const typingIndicator = document.createElement('div');
  typingIndicator.className = 'chat-msg agent typing';
  typingIndicator.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  chatHistory.appendChild(typingIndicator);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  try {
    const res = await fetch(`/api/v4/mesh/${currentChatAgent.simId}/agent/${currentChatAgent.id}/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const data = await res.json();
    typingIndicator.remove();
    appendChatMsg(data.reply || data.error || 'No response.', 'agent');
  } catch (err) {
    typingIndicator.remove();
    appendChatMsg(`Error: ${err.message}`, 'agent');
  }
}

function appendChatMsg(text, who, save = true) {
  const div = document.createElement('div');
  div.className = `chat-msg ${who}`;
  div.textContent = text;
  chatHistory.appendChild(div);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  if (save && currentChatAgent) {
    if (!chatHistoriesByAgent[currentChatAgent.id]) {
      chatHistoriesByAgent[currentChatAgent.id] = [];
    }
    chatHistoriesByAgent[currentChatAgent.id].push({ text, who });
  }
}

// ── Main runner ──────────────────────────────────────────────────────
async function runScenario() {
  // Clear chat histories for new simulation run
  for (const key in chatHistoriesByAgent) {
    delete chatHistoriesByAgent[key];
  }

  statusEl.innerHTML = '';
  printedAutomationLogsCount = 0;

  const questionInput = document.getElementById('question');
  const factsInput = document.getElementById('facts');
  if (questionInput) {
    questionInput.disabled = true;
    questionInput.style.opacity = '0.4';
    questionInput.style.cursor = 'not-allowed';
  }
  if (factsInput) {
    factsInput.disabled = true;
    factsInput.style.opacity = '0.4';
    factsInput.style.cursor = 'not-allowed';
  }

  const bgWrapperStart = `
<div id="empty-state-container" style="position:relative; width:100%; min-height:calc(100vh - 2rem); display:flex;">
  <div style="position: absolute; top:0; left:0; width: 100%; height: 100%; border-radius: 4px; overflow: hidden;">
    <canvas id="tutorial-canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none;"></canvas>
  </div>
  <div style="position: relative; z-index: 10; width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden; display: flex; align-items: center; justify-content: center;">
`;
  const bgWrapperEnd = `</div></div>`;

  let loadingHtml = COUNCIL_LOADING_STATE;
  if (currentMode === 'mesh') loadingHtml = MESH_LOADING_STATE;
  else if (currentMode === 'router') loadingHtml = ROUTER_LOADING_STATE;
  else if (currentMode === 'divergence') loadingHtml = DIVERGENCE_LOADING_STATE;

  results.innerHTML = bgWrapperStart + loadingHtml + bgWrapperEnd;

  // Re-bind physics for the loading state!
  if (currentTutorialCleanup) {
    currentTutorialCleanup();
    currentTutorialCleanup = null;
  }
  setTimeout(() => {
    currentTutorialCleanup = initTutorialPhysics('tutorial-canvas', currentMode);
  }, 10);

  logConsole('ESTABLISHING CONNECTION...', 'system');

  // Initialize telemetry state
  const maxTicksVal = currentMode === 'mesh'
    ? Number(document.getElementById('tick-count')?.value || 4)
    : 1;
  const startNodes = 0;
  const startSchemas = currentMode === 'mesh'
    ? 0
    : Number(document.getElementById('branch-count')?.value || 4);
  const initialDensity = `0 relations / ${startNodes} nodes (${startSchemas} schemas)`;

  currentTelemetry = {
    status: 'running',
    currentTick: 0,
    maxTicks: maxTicksVal,
    llmCallCount: 0,
    elapsed: '0.0s',
    determinedField: 'CLASSIFYING DOMAIN...',
    activeSchema: 'Awaiting Extraction...',
    graphDensity: initialDensity,
    durations: []
  };

  startTelemetryTimer();

  try {
    currentAbortController = new AbortController();
    modeStatus[currentMode] = 'loading';
    if (currentMode === 'mesh') {
      await runMeshScenario();
    } else if (currentMode === 'council') {
      await runCouncilScenario();
    } else if (currentMode === 'router') {
      await runRouterScenario();
    } else if (currentMode === 'divergence') {
      await runDivergenceScenario();
    }
    modeStatus[currentMode] = 'done';
    currentTelemetry.status = 'completed';
  } catch (err) {
    modeStatus[currentMode] = 'idle';
    currentTelemetry.status = 'standby';
    throw err;
  } finally {
    currentAbortController = null;
    updateTelemetryUI(currentTelemetry);
    stopTelemetryTimer();
    await refreshRuns();

    if (questionInput) {
      questionInput.disabled = false;
      questionInput.style.opacity = '1';
      questionInput.style.cursor = 'text';
    }
    if (factsInput) {
      factsInput.disabled = false;
      factsInput.style.opacity = '1';
      factsInput.style.cursor = 'text';
    }
  }
}

async function runCouncilScenario() {
  collectedInterviews.length = 0; // reset for new run
  const interviewPanel = document.getElementById('interview-panel');
  const interviewLog = document.getElementById('interview-log');
  if (interviewPanel) interviewPanel.classList.remove('visible');
  if (interviewLog) interviewLog.innerHTML = '<p style="color:var(--text-secondary);font-size:.78rem;font-style:italic;">No cross-examinations this run — all personas committed to a firm stance on first evaluation.</p>';

  const payload = {
    mode: 'council',
    question: questionInput.value.trim(),
    facts: lineList(factsInput.value),
    customPersonas: customPersonaList.filter(p => p.trim() !== ''),
    branchCount: Number(branchCountInput.value),
    personaCount: Number(personaCountInput.value)
  };
  const res = await fetch('/api/v4/automation/router', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: currentAbortController ? currentAbortController.signal : undefined
  });
  if (!res.ok) {
    let errorMessage = 'Council simulation failed';
    try {
      const errorData = await res.json();
      errorMessage = errorData.error || errorMessage;
    } catch(e) {
      errorMessage = `Gateway Error: ${res.status} ${res.statusText}`;
    }
    if (res.status === 402) throw new Error(`INSUFFICIENT_TOKENS: ${errorMessage}`);
    throw new Error(errorMessage);
  }
  const data = await res.json();
  const result = data.simulation_result;
  const resultLogs = (result && (result.timeline || result.logs)) || null;
  if (resultLogs && Array.isArray(resultLogs)) {
    const parsed = parseTelemetryFromLogs(resultLogs, 'council');
    currentTelemetry = {
      ...currentTelemetry,
      ...parsed,
      durations: parsed.durations.length > 0 ? parsed.durations : currentTelemetry.durations,
      graphDensity: parsed.graphDensity !== '0 relations / 0 nodes' ? parsed.graphDensity : currentTelemetry.graphDensity
    };
  }
  logConsole(`COUNCIL COMPLETE.`, 'success');
  await rerender(result);
  renderInterviewPanel(collectedInterviews);
}

async function runMeshScenario() {
  feedScroller.innerHTML = '';
  meshFeedPanel.classList.remove('visible');

  const payload = {
    mode: 'mesh',
    question: questionInput.value.trim(),
    facts: lineList(factsInput.value),
    customPersonas: customPersonaList.filter(p => p.trim() !== ''),
    agentCount: Math.max(DEFAULT_CONFIG.LIMITS.mesh.minAgents, Math.min(DEFAULT_CONFIG.LIMITS.mesh.maxAgents, Number(document.getElementById('agent-count').value))),
    tickCount: Math.max(DEFAULT_CONFIG.LIMITS.mesh.minTicks, Math.min(DEFAULT_CONFIG.LIMITS.mesh.maxTicks, Number(document.getElementById('tick-count').value))),
  };
  const res = await fetch('/api/v4/automation/router', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: currentAbortController ? currentAbortController.signal : undefined
  });
  if (!res.ok) {
    let errorMessage = 'Mesh simulation failed';
    try {
      const errorData = await res.json();
      errorMessage = errorData.error || errorMessage;
    } catch(e) {
      errorMessage = `Gateway Error: ${res.status} ${res.statusText}`;
    }
    if (res.status === 402) throw new Error(`INSUFFICIENT_TOKENS: ${errorMessage}`);
    throw new Error(errorMessage);
  }
  const data = await res.json();
  const result = data.simulation_result;
  currentMeshSimId = result.id;
  const resultLogs = (result && (result.timeline || result.logs)) || null;
  if (resultLogs && Array.isArray(resultLogs)) {
    const parsed = parseTelemetryFromLogs(resultLogs, 'mesh');
    currentTelemetry = {
      ...currentTelemetry,
      ...parsed,
      durations: parsed.durations.length > 0 ? parsed.durations : currentTelemetry.durations,
      graphDensity: parsed.graphDensity !== '0 relations / 0 nodes' ? parsed.graphDensity : currentTelemetry.graphDensity
    };
  }
  logConsole(`MESH COMPLETE. ${result.interactions?.length || 0} INTERACTIONS RECORDED.`, 'success');

  results.innerHTML = renderMeshResults(result);
  meshFeedPanel.classList.add('visible');
  renderFeed(result.interactions || [], result.roundSummaries || []);
  initRelationsGraphHover(result.agents || []);

  document.querySelectorAll('[data-agent-id]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.hasAttribute('data-chat-agent')) return;
      const simId = card.dataset.simId || currentMeshSimId;
      openInspector(card.dataset.agentId, simId);
    });
  });
  document.querySelectorAll('[data-chat-agent]').forEach(btn => {
    btn.addEventListener('click', openChatModal);
  });
}

function getRunLabel(mode) {
  if (mode === 'mesh') return 'LAUNCH MESH';
  if (mode === 'council') return 'LAUNCH COUNCIL';
  if (mode === 'router') return 'Launch Router';
  if (mode === 'divergence') return 'Launch Divergence';
  return 'LAUNCH';
}

function getCancelLabel(mode) {
  if (mode === 'mesh') return 'CANCEL MESH';
  if (mode === 'council') return 'CANCEL COUNCIL';
  if (mode === 'router') return 'Cancel Router';
  if (mode === 'divergence') return 'Cancel Divergence';
  return 'CANCEL';
}

function calculateForecasts(dMetric, sMetric, mode) {
  const mapRange = (val, inMin, inMax, outMin, outMax) => Math.round((val - inMin) * (outMax - outMin) / (inMax - inMin) + outMin);
  
  const limits = DEFAULT_CONFIG.LIMITS;
  const branchCount = mapRange(dMetric, 1, 40, limits.council.minBranches, limits.council.maxBranches);
  const personaCount = mapRange(sMetric, 1, 40, limits.council.minPersonas, limits.council.maxPersonas);
  const agentCount = mapRange(dMetric, 1, 40, limits.mesh.minAgents, limits.mesh.maxAgents);
  const tickCount = mapRange(sMetric, 1, 40, limits.mesh.minTicks, limits.mesh.maxTicks);
  const depth = mapRange(dMetric, 1, 40, limits.tree.minDepth, limits.tree.maxDepth);
  const branchingFactor = mapRange(sMetric, 1, 40, limits.tree.minBranchingFactor, limits.tree.maxBranchingFactor);

  const cTokens = (personaCount * branchCount) + 5;
  const mTokens = (agentCount * tickCount * 2) + 5;
  let tTokens = 5;
  let tNodes = 0;
  for (let k = 0; k < depth; k++) {
    tTokens += Math.pow(branchingFactor, k) + 2 * Math.pow(branchingFactor, k + 1);
    tNodes += Math.pow(branchingFactor, k);
  }

  let projectedTokens = 0;
  let virtualEntities = "";
  let computationalForecast = 0;

  if (mode === 'divergence') {
    projectedTokens = cTokens + mTokens + tTokens + 50;
    virtualEntities = `${agentCount + personaCount} Agents, ${branchCount} Branches, ${depth} Timelines`;
    computationalForecast = (personaCount * branchCount) + (agentCount * tickCount) + tNodes;
  } else {
    projectedTokens = Math.max(cTokens, mTokens, tTokens) + 15;
    virtualEntities = `Up to ${Math.max(agentCount, personaCount)} Agents, ${branchCount} Branches, ${depth} Timelines`;
    computationalForecast = Math.max((personaCount * branchCount), (agentCount * tickCount), tNodes);
  }

  return { projectedTokens, virtualEntities, computationalForecast };
}

async function runRouterScenario() {
  logConsole('CONNECTING TO AUTOMATION ROUTER...', 'system');
  logConsole('CLASSIFYING INPUT REALITY DOMAIN...', 'system');

  const dMetric = Number(document.getElementById('depth-metric')?.value || 15);
  const sMetric = Number(document.getElementById('scale-metric')?.value || 10);
  const forecasts = calculateForecasts(dMetric, sMetric, 'router');

  currentTelemetry = {
    status: 'running',
    elapsed: 0,
    startTime: Date.now(),
    llmCallCount: 0,
    currentTick: 0,
    determinedField: 'UNKNOWN',
    graphDensity: 'ROUTING...',
    scenario: questionInput.value.trim(),
    ...forecasts,
    orchestrationPhase: 'DYNAMIC ROUTING'
  };
  updateTelemetryUI(currentTelemetry);

  const mapRange = (val, inMin, inMax, outMin, outMax) => Math.round((val - inMin) * (outMax - outMin) / (inMax - inMin) + outMin);

  const limits = DEFAULT_CONFIG.LIMITS;
  const payload = {
    mode: 'router',
    question: questionInput.value.trim(),
    facts: lineList(factsInput.value),
    customPersonas: customPersonaList.filter(p => p.trim() !== ''),
    branchCount: mapRange(dMetric, 1, 40, limits.council.minBranches, limits.council.maxBranches),
    personaCount: mapRange(sMetric, 1, 40, limits.council.minPersonas, limits.council.maxPersonas),
    agentCount: mapRange(dMetric, 1, 40, limits.mesh.minAgents, limits.mesh.maxAgents),
    tickCount: mapRange(sMetric, 1, 40, limits.mesh.minTicks, limits.mesh.maxTicks),
    depth: mapRange(dMetric, 1, 40, limits.tree.minDepth, limits.tree.maxDepth),
    branchingFactor: mapRange(sMetric, 1, 40, limits.tree.minBranchingFactor, limits.tree.maxBranchingFactor)
  };

  const res = await fetch('/api/v4/automation/router', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: currentAbortController ? currentAbortController.signal : undefined
  });
  
  if (!res.ok) {
    let errorMessage = 'Router execution failed';
    try {
      const errorData = await res.json();
      errorMessage = errorData.error || errorMessage;
    } catch(e) {
      errorMessage = `Gateway Error: ${res.status} ${res.statusText}`;
    }
    if (res.status === 402) throw new Error(`INSUFFICIENT_TOKENS: ${errorMessage}`);
    throw new Error(errorMessage);
  }
  
  const data = await res.json();

  logConsole(`OPTIMAL REALITY ROUTED SUCCESSFULLY: ${data.router_selection.mode.toUpperCase()}`, 'success');
  logConsole(`REASONING: ${data.router_selection.reasoning}`, 'system');

  const selectedMode = data.router_selection.mode.toLowerCase();

  // Set currentMode and call setMode to update UI elements, active class, run button label
  currentMode = selectedMode;
  setMode(selectedMode);

  const simResult = data.simulation_result;

  // Extract logs from result for final telemetry merge
  const resultLogs = (simResult && (simResult.timeline || simResult.logs)) || null;
  if (resultLogs && Array.isArray(resultLogs)) {
    const parsed = parseTelemetryFromLogs(resultLogs, selectedMode);
    currentTelemetry = {
      ...currentTelemetry,
      ...parsed,
      durations: parsed.durations.length > 0 ? parsed.durations : currentTelemetry.durations,
      graphDensity: parsed.graphDensity !== '0 relations / 0 nodes' ? parsed.graphDensity : currentTelemetry.graphDensity
    };
  }

  if (selectedMode === 'mesh') {
    currentMeshSimId = simResult.id;
    results.innerHTML = renderMeshResults(simResult);
    meshFeedPanel.classList.add('visible');
    renderFeed(simResult.interactions || [], simResult.roundSummaries || []);
    initRelationsGraphHover(simResult.agents || []);

    document.querySelectorAll('[data-agent-id]').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.hasAttribute('data-chat-agent')) return;
        const simId = card.dataset.simId || currentMeshSimId;
        openInspector(card.dataset.agentId, simId);
      });
    });
    document.querySelectorAll('[data-chat-agent]').forEach(btn => {
      btn.addEventListener('click', openChatModal);
    });
  } else if (selectedMode === 'tree') {
    _treeData = simResult;
    currentTelemetry.determinedField = (_treeData.domain || 'UNKNOWN').toUpperCase();
    currentTelemetry.graphDensity = `${_treeData.tree.nodes.length} nodes computed`;
    currentTelemetry.llmCallCount = _treeData.llmCallCount || 0;
    updateTelemetryUI(currentTelemetry);

    const varLabels = (_treeData.decisionSpace || {}).variable_labels || {};
    const flowCont = _t('tree-flow-content');
    if (flowCont) {
      flowCont.style.padding = '1.2rem';
      flowCont.style.position = 'static';
      flowCont.style.minHeight = 'auto';
      flowCont.innerHTML = renderDominantFuturesHtml(
        _treeData.dominantFutures || [],
        _treeData.decisionSpace || {}
      );
    }

    const resultsCont = document.getElementById('tree-results-container');
    if (resultsCont) resultsCont.style.display = 'block';

    const scatterEl = _t('tree-scatter-content');
    if (scatterEl) {
      scatterEl.innerHTML = renderTreeFlowHtml(_treeData.tree.nodes, _treeData.root_state, varLabels);
    }

    const svgCont = _t('tree-svg-container');
    if (svgCont) {
      svgCont.innerHTML = renderTreeCausalSvg(_treeData.tree.nodes);
      const nodeMap = Object.fromEntries(_treeData.tree.nodes.map(n => [n.id, n]));
      svgCont.querySelectorAll('.tree-node-g').forEach(g => {
        g.addEventListener('click', () => {
          const node = _treeData.tree.nodes.find(n => n.id === g.dataset.nodeid);
          if (!node) return;
          const chain = [];
          let cur = node;
          while (cur) { chain.unshift(cur); cur = cur.parent ? nodeMap[cur.parent] : null; }
          _treeOpenDrawer(node, chain);
        });
      });
    }
  } else {
    // council
    currentCouncilSimId = simResult.id;
    results.innerHTML = renderResults(simResult);
    try {
      const popTarget = document.getElementById('population-viz');
      if (popTarget) popTarget.innerHTML = renderPopulationSvg(simResult.population.personas, simResult.recommendation?.branchId);
    } catch (e) { console.error(e); }
  results.querySelectorAll('[data-record-outcome]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.recordOutcome;
        logConsole(`RECORDING OUTCOME FOR BRANCH: ${id}`, 'system');
        await fetch(`/api/v4/runs/${simResult.id}/outcome`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: id, success: id === simResult.recommendation.branchId })
        });

        logConsole(`INGESTING BRANCH KNOWLEDGE INTO MEMTRACE...`, 'system');
        try {
          const ingestRes = await fetch(`/api/v4/runs/${simResult.id}/branches/${id}/ingest`, { method: 'POST' });
          if (ingestRes.ok) {
            logConsole(`SUCCESS: Branch ${id} saved to Knowledge Graph.`, 'system');
            btn.style.background = '#4CAF50';
            btn.style.color = 'white';
          } else {
            const ingestErr = await ingestRes.json().catch(() => ({ error: 'unknown' }));
            logConsole(`FAILED: Branch ingest failed — ${ingestErr.error}`, 'error');
          }
        } catch (err) {
          logConsole(`INGEST ERROR: ${err.message}`, 'error');
        }

        refreshRuns();
      });
    });

    results.querySelectorAll('[data-resimulate-branch]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (currentMode !== 'council') {
          console.warn("Re-simulate is only allowed in Council mode.");
          return;
        }
        const branchId = btn.dataset.resimulateBranch;
        const inputEl = document.getElementById(`counter-input-${branchId}`);
        const newEvidence = inputEl ? inputEl.value.trim() : '';

        if (!newEvidence) {
          alert("Please provide a counter-argument or new evidence to re-simulate this branch.");
          return;
        }

        btn.innerText = 'SIMULATING...';
        btn.disabled = true;
        logConsole(`RESIMULATING BRANCH: ${branchId} WITH NEW EVIDENCE`, 'system');

        try {
          const response = await fetch(`/api/v4/runs/${simResult.id}/branches/${branchId}/resimulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newEvidence })
          });
          const resJob = await response.json();
          if (!response.ok) throw new Error(resJob.error || 'Resimulation failed');

          logConsole(`RESIMULATION QUEUED: ${resJob.jobId}`, 'system');
          const finalResult = await pollJob(resJob.jobId, '/api/v4/jobs');
          logConsole('RESIMULATION COMPLETE.', 'success');
          
          if (finalResult.recommendation) simResult.recommendation = finalResult.recommendation;
          if (finalResult.counterfactuals) simResult.counterfactuals = finalResult.counterfactuals;
          if (finalResult.allBranches && finalResult.allBranches.length > 0) {
            simResult.branches = finalResult.allBranches;
          } else if (finalResult.updatedBranch) {
            const bIndex = simResult.branches.findIndex(b => b.id === branchId);
            if (bIndex >= 0) simResult.branches[bIndex] = finalResult.updatedBranch;
          }
          await rerender(simResult);
        } catch (err) {
          logConsole(`RESIMULATION ERROR: ${err.message}`, 'error');
          btn.innerText = 'RE-SIMULATE';
          btn.disabled = false;
        }
      });
    });

    if (simResult.interviews && simResult.interviews.length > 0) {
      renderInterviewPanel(simResult.interviews);
    }
  }
}

function switchDivergenceTab(tabName, rawResults) {
  // Update active class on tab buttons
  document.querySelectorAll('.divergence-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`div-tab-${tabName}`);
  if (activeBtn) activeBtn.classList.add('active');

  const contentPane = document.getElementById('divergence-tab-content-pane');
  if (!contentPane) return;

  // Clear previous content
  contentPane.innerHTML = '';

  // Hide mesh and interview panels by default
  const meshPanel = document.getElementById('mesh-feed-panel');
  if (meshPanel) meshPanel.classList.remove('visible');
  const interviewPanel = document.getElementById('interview-panel');
  if (interviewPanel) interviewPanel.classList.remove('visible');

  if (tabName === 'council') {
    const councilResult = rawResults.council;
    if (!councilResult || councilResult.error) {
      contentPane.innerHTML = `<div class="card" style="border-color:var(--accent-orange);color:var(--accent-orange)">Council Simulation Error: ${councilResult?.error || 'No result data'}</div>`;
      return;
    }
    contentPane.innerHTML = renderResults(councilResult);
    try {
      const popTarget = document.getElementById('population-viz');
      if (popTarget) {
        popTarget.innerHTML = renderPopulationSvg(councilResult.population.personas, councilResult.recommendation?.branchId);
      }
    } catch (e) {
      console.error(e);
    }
    // Record outcome event listeners
    contentPane.querySelectorAll('[data-record-outcome]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.recordOutcome;
        logConsole(`RECORDING OUTCOME FOR BRANCH: ${id}`, 'system');
        await fetch(`/api/v4/runs/${councilResult.id}/outcome`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: id, success: id === councilResult.recommendation?.branchId })
        });
        logConsole(`INGESTING BRANCH KNOWLEDGE INTO MEMTRACE...`, 'system');
        try {
          const ingestRes = await fetch(`/api/v4/runs/${councilResult.id}/branches/${id}/ingest`, { method: 'POST' });
          if (ingestRes.ok) {
            logConsole(`SUCCESS: Branch ${id} saved to Knowledge Graph.`, 'system');
            btn.style.background = '#4CAF50';
            btn.style.color = 'white';
          } else {
            logConsole(`FAILED: Branch ingest failed.`, 'error');
          }
        } catch (err) {
          logConsole(`INGEST ERROR: ${err.message}`, 'error');
        }
        refreshRuns();
      });
    });
    // Re-simulate event listeners
    contentPane.querySelectorAll('[data-resimulate-branch]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const branchId = btn.dataset.resimulateBranch;
        const inputEl = document.getElementById(`counter-input-${branchId}`);
        const newEvidence = inputEl ? inputEl.value.trim() : '';
        if (!newEvidence) {
          alert("Please provide a counter-argument or new evidence to re-simulate this branch.");
          return;
        }
        btn.innerText = 'SIMULATING...';
        btn.disabled = true;
        logConsole(`RESIMULATING BRANCH: ${branchId} WITH NEW EVIDENCE`, 'system');
        try {
          const response = await fetch(`/api/v4/runs/${councilResult.id}/branches/${branchId}/resimulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newEvidence })
          });
          const resJob = await response.json();
          if (!response.ok) throw new Error(resJob.error || 'Resimulation failed');

          logConsole(`RESIMULATION QUEUED: ${resJob.jobId}`, 'system');
          const finalResult = await pollJob(resJob.jobId, '/api/v4/jobs');
          logConsole('RESIMULATION COMPLETE.', 'success');
          
          // Atomically update the cached result before re-rendering
          if (finalResult.recommendation) councilResult.recommendation = finalResult.recommendation;
          if (finalResult.counterfactuals) councilResult.counterfactuals = finalResult.counterfactuals;
          if (finalResult.allBranches && finalResult.allBranches.length > 0) {
            councilResult.branches = finalResult.allBranches;
          } else if (finalResult.updatedBranch) {
            const bIndex = councilResult.branches.findIndex(b => b.id === branchId);
            if (bIndex >= 0) councilResult.branches[bIndex] = finalResult.updatedBranch;
          }
          rawResults.council = councilResult;
          switchDivergenceTab('council', rawResults);
        } catch (err) {
          logConsole(`RESIMULATION ERROR: ${err.message}`, 'error');
          btn.innerText = 'RE-SIMULATE';
          btn.disabled = false;
        }
      });
    });
    // Show interviews
    if (councilResult.interviews && councilResult.interviews.length > 0) {
      renderInterviewPanel(councilResult.interviews);
    }
  } else if (tabName === 'mesh') {
    const meshResult = rawResults.mesh;
    if (!meshResult || meshResult.error) {
      contentPane.innerHTML = `<div class="card" style="border-color:var(--accent-orange);color:var(--accent-orange)">Mesh Simulation Error: ${meshResult?.error || 'No result data'}</div>`;
      return;
    }
    contentPane.innerHTML = renderMeshResults(meshResult);
    if (meshPanel) meshPanel.classList.add('visible');
    renderFeed(meshResult.interactions || [], meshResult.roundSummaries || []);
    initRelationsGraphHover(meshResult.agents || []);

    contentPane.querySelectorAll('[data-agent-id]').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.hasAttribute('data-chat-agent')) return;
        openInspector(card.dataset.agentId, meshResult.id);
      });
    });
    contentPane.querySelectorAll('[data-chat-agent]').forEach(btn => {
      btn.addEventListener('click', openChatModal);
    });
  } else if (tabName === 'tree') {
    const treeResult = rawResults.tree;
    if (!treeResult || treeResult.error) {
      contentPane.innerHTML = `<div class="card" style="border-color:var(--accent-orange);color:var(--accent-orange)">Tree Simulation Error: ${treeResult?.error || 'No result data'}</div>`;
      return;
    }
    contentPane.innerHTML = `
      <div id="div-tree-flow-content" style="padding:1.2rem;"></div>
      <div id="div-tree-results-container">
        <div class="tree-section-header">
          <span>EXPECTED CHANGE FROM YOUR CURRENT SITUATION</span>
          <span style="font-size:0.58rem;opacity:0.5;">Variable impact across all simulated paths</span>
        </div>
        <div id="div-tree-scatter-content" style="padding:1.2rem 1.2rem 0;"></div>
        <div class="tree-section-header" style="margin-top:1rem;">
          <span>WHAT HAPPENS NEXT</span>
          <span style="font-size:0.58rem;opacity:0.5;">Click any node to inspect its state</span>
        </div>
        <div id="div-tree-svg-container" style="overflow:auto; padding:1.2rem;"></div>
      </div>
    `;

    const varLabels = (treeResult.decisionSpace || {}).variable_labels || {};
    const flowCont = document.getElementById('div-tree-flow-content');
    if (flowCont) {
      flowCont.innerHTML = renderDominantFuturesHtml(
        treeResult.dominantFutures || [],
        treeResult.decisionSpace || {}
      );
    }
    const scatterEl = document.getElementById('div-tree-scatter-content');
    if (scatterEl) {
      scatterEl.innerHTML = renderTreeFlowHtml(treeResult.tree.nodes, treeResult.root_state, varLabels);
    }
    const svgCont = document.getElementById('div-tree-svg-container');
    if (svgCont) {
      svgCont.innerHTML = renderTreeCausalSvg(treeResult.tree.nodes);
      const nodeMap = Object.fromEntries(treeResult.tree.nodes.map(n => [n.id, n]));
      svgCont.querySelectorAll('.tree-node-g').forEach(g => {
        g.addEventListener('click', () => {
          const node = treeResult.tree.nodes.find(n => n.id === g.dataset.nodeid);
          if (!node) return;
          const chain = [];
          let cur = node;
          while (cur) { chain.unshift(cur); cur = cur.parent ? nodeMap[cur.parent] : null; }
          _treeOpenDrawer(node, chain);
        });
      });
    }
  }
}

async function runDivergenceScenario() {
  logConsole('CONNECTING TO REALITY DIVERGENCE ENGINE...', 'system');
  logConsole('RUNNING ALL REALITIES IN PARALLEL...', 'system');

  const dMetric = Number(document.getElementById('depth-metric')?.value || 15);
  const sMetric = Number(document.getElementById('scale-metric')?.value || 10);
  const forecasts = calculateForecasts(dMetric, sMetric, 'divergence');

  currentTelemetry = {
    status: 'running',
    elapsed: 0,
    startTime: Date.now(),
    llmCallCount: 0,
    currentTick: 0,
    determinedField: 'DIVERGENCE',
    graphDensity: 'PARALLEL SYNTHESIS',
    scenario: questionInput.value.trim(),
    ...forecasts,
    orchestrationPhase: 'PARALLEL EXECUTION'
  };
  updateTelemetryUI(currentTelemetry);

  const mapRange = (val, inMin, inMax, outMin, outMax) => Math.round((val - inMin) * (outMax - outMin) / (inMax - inMin) + outMin);

  const limits = DEFAULT_CONFIG.LIMITS;
  const payload = {
    question: questionInput.value.trim(),
    facts: lineList(factsInput.value),
    customPersonas: customPersonaList.filter(p => p.trim() !== ''),
    runSequentially: false,
    branchCount: mapRange(dMetric, 1, 40, limits.council.minBranches, limits.council.maxBranches),
    personaCount: mapRange(sMetric, 1, 40, limits.council.minPersonas, limits.council.maxPersonas),
    agentCount: mapRange(dMetric, 1, 40, limits.mesh.minAgents, limits.mesh.maxAgents),
    tickCount: mapRange(sMetric, 1, 40, limits.mesh.minTicks, limits.mesh.maxTicks),
    depth: mapRange(dMetric, 1, 40, limits.tree.minDepth, limits.tree.maxDepth),
    branchingFactor: mapRange(sMetric, 1, 40, limits.tree.minBranchingFactor, limits.tree.maxBranchingFactor)
  };

  const res = await fetch('/api/v4/automation/divergence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: currentAbortController ? currentAbortController.signal : undefined
  });
  
  if (!res.ok) {
    let errorMessage = 'Divergence execution failed';
    try {
      const errorData = await res.json();
      errorMessage = errorData.error || errorMessage;
    } catch(e) {
      errorMessage = `Gateway Error: ${res.status} ${res.statusText}`;
    }
    if (res.status === 402) throw new Error(`INSUFFICIENT_TOKENS: ${errorMessage}`);
    throw new Error(errorMessage);
  }
  
  const data = await res.json();

  logConsole('DIVERGENCE SYNTHESIS SEQUENCE COMPLETED.', 'success');

  const rawResults = data.raw_results;

  results.innerHTML = `
    <div class="divergence-synthesis-section">
      ${renderDivergenceReport(data.synthesis_report)}
    </div>
    <div class="divergence-tabs-nav">
      <button class="divergence-tab-btn" id="div-tab-council" type="button">⌬ COUNCIL RESULTS</button>
      <button class="divergence-tab-btn" id="div-tab-mesh" type="button">⬡ MESH RESULTS</button>
      <button class="divergence-tab-btn" id="div-tab-tree" type="button">⟁ TREE RESULTS</button>
    </div>
    <div id="divergence-tab-content-pane" class="divergence-tab-content"></div>
  `;

  document.getElementById('div-tab-council').addEventListener('click', () => switchDivergenceTab('council', rawResults));
  document.getElementById('div-tab-mesh').addEventListener('click', () => switchDivergenceTab('mesh', rawResults));
  document.getElementById('div-tab-tree').addEventListener('click', () => switchDivergenceTab('tree', rawResults));

  switchDivergenceTab('council', rawResults);
}

// ── State panel ──────────────────────────────────────────────────────
async function refreshRuns() {
  const res = await fetch('/api/v4/state');
  const state = await res.json();

  if (currentTelemetry.status === 'running' || currentTelemetry.status === 'completed') {
    updateTelemetryUI(currentTelemetry);
  } else {
    updateTelemetryStandby();
  }
}

function updateTelemetryStandby() {
  if (currentTelemetry.status === 'running' || currentTelemetry.status === 'completed') return;

  const limits = DEFAULT_CONFIG.LIMITS;
  const depthVal = Number(document.getElementById('depth-metric')?.value || 15);
  const scaleVal = Number(document.getElementById('scale-metric')?.value || 15);
  const mapRange = (val, inMin, inMax, outMin, outMax) => Math.round((val - inMin) * (outMax - outMin) / (inMax - inMin) + outMin);

  const councilBranches = mapRange(depthVal, 1, 40, limits.council.minBranches, limits.council.maxBranches);
  const councilPersonas = mapRange(scaleVal, 1, 40, limits.council.minPersonas, limits.council.maxPersonas);
  const meshAgents = mapRange(depthVal, 1, 40, limits.mesh.minAgents, limits.mesh.maxAgents);
  const meshTicks = mapRange(scaleVal, 1, 40, limits.mesh.minTicks, limits.mesh.maxTicks);
  const treeDepth = mapRange(depthVal, 1, 40, limits.tree.minDepth, limits.tree.maxDepth);
  const treeBranching = mapRange(scaleVal, 1, 40, limits.tree.minBranchingFactor, limits.tree.maxBranchingFactor);

  recentRuns.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:.6rem;">
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">SYSTEM STATUS:</span>
        <span style="color:var(--accent-green); font-weight:bold;">STANDBY</span>
      </div>
      ${(currentMode === 'router' || currentMode === 'divergence') ? `
      <div style="display:flex; flex-direction:column; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.4rem; gap:0.4rem; font-size:0.75rem;">
        <div style="color:var(--text-secondary); margin-bottom:0.2rem;">SIMULATION SETTINGS:</div>
        <div style="color:var(--text-primary);">
          <strong style="color:var(--accent-blue);">🏛️ Council:</strong> ${councilBranches} branches, ${councilPersonas} personas
        </div>
        <div style="color:var(--text-primary);">
          <strong style="color:var(--accent-orange);">🕸️ Mesh:</strong> ${meshAgents} agents, ${meshTicks} iterations
        </div>
        <div style="color:var(--text-primary);">
          <strong style="color:var(--accent-green);">🌳 Tree:</strong> Depth ${treeDepth}, Branching ${treeBranching}
        </div>
      </div>
      ` : `
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">ONGOING ROUND:</span>
        <span style="color:var(--accent-cyan); font-weight:bold;">0 / 4</span>
      </div>
      `}
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">LLM REQUESTS:</span>
        <span style="color:var(--accent-green); font-weight:bold;">0</span>
      </div>
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">ELAPSED TIME:</span>
        <span style="color:var(--accent-orange); font-weight:bold;">0.0s</span>
      </div>
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">CLASSIFIED AREA:</span>
        <span style="color:var(--accent-cyan); font-weight:bold;">STANDBY</span>
      </div>
      ${currentMode === 'mesh' ? `
      <div style="display:flex; flex-direction:column; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">ACTIVE SCHEMA:</span>
        <span style="color:var(--text-primary); font-size:.7rem; margin-top:.1rem; word-break:break-all;">STANDBY</span>
      </div>
      <div style="display:flex; flex-direction:column; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">GRAPH DENSITY:</span>
        <span style="color:var(--text-primary); font-size:.7rem; margin-top:.1rem;">0 relations / 0 nodes</span>
      </div>
      <div style="display:flex; flex-direction:column; padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">ROUND DURATIONS:</span>
        <div style="color:var(--text-primary); font-size:.7rem; margin-top:.1rem; line-height:1.2; display:flex; flex-direction:column; gap:2px;">
          <div style="color:var(--text-secondary)">None completed yet.</div>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Telemetry helpers ────────────────────────────────────────────────
function startTelemetryTimer() {
  if (telemetryInterval) clearInterval(telemetryInterval);
  telemetryStartTime = Date.now();

  let pollingStatus = false;

  telemetryInterval = setInterval(async () => {
    const elapsed = ((Date.now() - telemetryStartTime) / 1000).toFixed(1) + 's';
    currentTelemetry.elapsed = elapsed;

    if (currentMode === 'tree' && currentTelemetry.status === 'running' && !pollingStatus) {
      pollingStatus = true;
      try {
        const res = await fetch('/api/v4/simulate/tree/status', {
          headers: {
            'Authorization': `Bearer ${_treeGetToken()}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          currentTelemetry.llmCallCount = data.llmCallCount || 0;
          currentTelemetry.currentTick = data.nodesComputed || 0;
          currentTelemetry.graphDensity = `${data.nodesComputed || 0} nodes computed`;
        }
      } catch (err) {
        console.error('Failed to fetch tree status:', err);
      } finally {
        pollingStatus = false;
      }
    }

    if ((currentMode === 'router' || currentMode === 'divergence' || currentMode === 'mesh' || currentMode === 'council') && currentTelemetry.status === 'running' && !pollingStatus) {
      pollingStatus = true;
      try {
        const res = await fetch('/api/v4/automation/status', {
          headers: {
            'Authorization': `Bearer ${_treeGetToken()}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          currentTelemetry.llmCallCount = data.llmCallCount || 0;
          if (data.automationState) {
            currentTelemetry.determinedField = data.automationState;
          }
          if (data.logs && data.logs.length > printedAutomationLogsCount) {
            for (let i = printedAutomationLogsCount; i < data.logs.length; i++) {
              const log = data.logs[i];
              logConsole(log.message, log.stage || 'automation');
              if (log.stage === 'interview' && log.details) {
                collectedInterviews.push(log.details);
              }
              if (log.details) {
                if (log.details.tick !== undefined) {
                  currentTelemetry.currentTick = log.details.tick;
                } else if (log.details.round !== undefined) {
                  currentTelemetry.currentTick = log.details.round;
                }
                // Fix 1: persist nodes/schemas from the one-time 'graph' emit so
                // subsequent round_end updates (which only carry edgesCount) don't
                // overwrite them with 0.
                if (log.details.nodes !== undefined) {
                  currentTelemetry._nodesCount = log.details.nodes;
                }
                if (log.details.schemaTypes && log.details.schemaTypes.length > 0) {
                  currentTelemetry._schemaTypesCount = log.details.schemaTypes.length;
                  currentTelemetry.activeSchema = log.details.schemaTypes.join(', ');
                }
                if (log.details.edgesCount !== undefined) {
                  const nodes = currentTelemetry._nodesCount || log.details.nodesCount || 0;
                  const schemas = currentTelemetry._schemaTypesCount || log.details.schemaTypes?.length || 0;
                  currentTelemetry.graphDensity = `${log.details.edgesCount} relations / ${nodes} nodes (${schemas} schemas)`;
                }
                // Fix 2: populate durations from round_end logs so the ROUND DURATIONS
                // panel shows real data instead of "None completed yet."
                if (log.stage === 'round_end' && log.details.duration !== undefined) {
                  const roundNum = log.details.round || (currentTelemetry.durations.length + 1);
                  const label = `Round ${roundNum}`;
                  if (!currentTelemetry.durations.some(d => d.label === label)) {
                    currentTelemetry.durations.push({ label, duration: log.details.duration });
                  }
                }
                if (log.stage === 'tick_end' && log.details.duration !== undefined) {
                  const tickNum = log.details.tick || (currentTelemetry.durations.length + 1);
                  const label = `Tick ${tickNum}`;
                  if (!currentTelemetry.durations.some(d => d.label === label)) {
                    currentTelemetry.durations.push({ label, duration: log.details.duration });
                  }
                }
                if (log.stage === 'phase_end' && log.details.duration !== undefined) {
                  const phase = log.details.phase || `Phase ${currentTelemetry.durations.length + 1}`;
                  const label = phase.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  if (!currentTelemetry.durations.some(d => d.label === label)) {
                    currentTelemetry.durations.push({ label, duration: log.details.duration });
                  }
                }
              }
            }
            printedAutomationLogsCount = data.logs.length;
          }
        }
      } catch (err) {
        console.error('Failed to fetch automation status:', err);
      } finally {
        pollingStatus = false;
      }
    }

    updateTelemetryUI(currentTelemetry);
  }, 2000);
}

function stopTelemetryTimer() {
  if (telemetryInterval) {
    clearInterval(telemetryInterval);
    telemetryInterval = null;
  }
}

function updateTelemetryUI(metrics = {}) {
  const current = metrics.currentTick || 0;
  const max = metrics.maxTicks || 0;
  const roundTickText = max > 0 ? `${current} / ${max}` : `${current}`;

  const llmCallCount = metrics.llmCallCount || 0;
  const elapsed = metrics.elapsed || '0.0s';
  const field = metrics.determinedField || 'CLASSIFYING...';

  const activeSchema = metrics.activeSchema || 'N/A';
  const density = metrics.graphDensity || '0 relations / 0 nodes';

  const depthMetric = Number(document.getElementById('depth-metric')?.value || 5);
  const scaleMetric = Number(document.getElementById('scale-metric')?.value || 4);

  const limits = DEFAULT_CONFIG.LIMITS;
  const mapRange = (val, inMin, inMax, outMin, outMax) => Math.round((val - inMin) * (outMax - outMin) / (inMax - inMin) + outMin);

  const councilBranches = mapRange(depthMetric, 1, 40, limits.council.minBranches, limits.council.maxBranches);
  const councilPersonas = mapRange(scaleMetric, 1, 40, limits.council.minPersonas, limits.council.maxPersonas);
  const meshAgents = mapRange(depthMetric, 1, 40, limits.mesh.minAgents, limits.mesh.maxAgents);
  const meshTicks = mapRange(scaleMetric, 1, 40, limits.mesh.minTicks, limits.mesh.maxTicks);
  const treeDepth = mapRange(depthMetric, 1, 40, limits.tree.minDepth, limits.tree.maxDepth);
  const treeBranching = mapRange(scaleMetric, 1, 40, limits.tree.minBranchingFactor, limits.tree.maxBranchingFactor);

  const durationsHtml = (metrics.durations || []).length > 0
    ? metrics.durations.map(d => `<div style="display:flex; justify-content:space-between;"><span style="color:var(--text-secondary)">${d.label}:</span><span style="color:var(--accent-orange); font-weight:bold;">${d.duration}s</span></div>`).join('')
    : '<div style="color:var(--text-secondary)">None completed yet.</div>';

  recentRuns.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:.6rem;">
      ${(currentMode === 'router' || currentMode === 'divergence') ? `
      <div style="display:flex; flex-direction:column; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.4rem; gap:0.4rem; font-size:0.75rem;">
        <div style="color:var(--text-secondary); margin-bottom:0.2rem;">SIMULATION SETTINGS:</div>
        <div style="color:var(--text-primary);">
          <strong style="color:var(--accent-blue);">🏛️ Council:</strong> ${councilBranches} branches, ${councilPersonas} personas
        </div>
        <div style="color:var(--text-primary);">
          <strong style="color:var(--accent-orange);">🕸️ Mesh:</strong> ${meshAgents} agents, ${meshTicks} iterations
        </div>
        <div style="color:var(--text-primary);">
          <strong style="color:var(--accent-green);">🌳 Tree:</strong> Depth ${treeDepth}, Branching ${treeBranching}
        </div>
      </div>
      ` : `
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">ONGOING ROUND:</span>
        <span style="color:var(--accent-cyan); font-weight:bold;">${roundTickText}</span>
      </div>
      `}
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">LLM REQUESTS:</span>
        <span style="color:var(--accent-green); font-weight:bold;">${llmCallCount}</span>
      </div>
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">ELAPSED TIME:</span>
        <span style="color:var(--accent-orange); font-weight:bold;">${elapsed}</span>
      </div>
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">CLASSIFIED AREA:</span>
        <span style="color:var(--accent-cyan); font-weight:bold;">${field}</span>
      </div>
      ${(currentMode === 'mesh' || currentMode === 'tree' || currentMode === 'council') ? `
      <div style="display:flex; flex-direction:column; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">ACTIVE SCHEMA:</span>
        <span style="color:var(--text-primary); font-size:.7rem; margin-top:.1rem; word-break:break-all;">${activeSchema}</span>
      </div>
      <div style="display:flex; flex-direction:column; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">GRAPH DENSITY:</span>
        <span style="color:var(--text-primary); font-size:.7rem; margin-top:.1rem;">${density}</span>
      </div>
      ` : ''}
      <div style="display:flex; flex-direction:column; padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">ROUND DURATIONS:</span>
        <div style="color:var(--text-primary); font-size:.7rem; margin-top:.1rem; line-height:1.2; display:flex; flex-direction:column; gap:2px;">
          ${durationsHtml}
        </div>
      </div>
      ${(currentMode === 'divergence' || currentMode === 'router') ? `
      <div style="display:flex; flex-direction:column; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">ORCHESTRATION PHASE:</span>
        <span style="color:var(--accent-purple); font-size:.7rem; margin-top:.1rem; font-weight:bold;">${metrics.orchestrationPhase || 'STANDBY'}</span>
      </div>
      <div style="display:flex; flex-direction:column; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">PROJECTED TOKENS:</span>
        <span style="color:var(--accent-orange); font-size:.7rem; margin-top:.1rem; font-weight:bold;">~${metrics.projectedTokens || 0}</span>
      </div>
      <div style="display:flex; flex-direction:column; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">TOKEN BURN RATE:</span>
        <span style="color:var(--accent-orange); font-size:.7rem; margin-top:.1rem;">${elapsed !== '0.0s' && llmCallCount > 0 ? (llmCallCount * 150 / parseFloat(elapsed)).toFixed(1) : '0.0'} t/s</span>
      </div>
      <div style="display:flex; flex-direction:column; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">VIRTUAL ENTITIES DEPLOYED:</span>
        <span style="color:var(--text-primary); font-size:.7rem; margin-top:.1rem;">${metrics.virtualEntities || 'None'}</span>
      </div>
      <div style="display:flex; flex-direction:column; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:.2rem;">
        <span style="color:var(--text-secondary)">COMPUTATIONAL FORECAST:</span>
        <span style="color:var(--text-primary); font-size:.7rem; margin-top:.1rem;">~${metrics.computationalForecast || 0} Operations Queued</span>
      </div>
      ` : ''}
    </div>
  `;
}

function parseTelemetryFromLogs(logs, currentMode) {
  let currentTick = 0;
  let maxTicks = currentMode === 'mesh'
    ? Number(document.getElementById('tick-count')?.value || 4)
    : 1;
  let determinedField = 'CLASSIFYING DOMAIN...';
  let activeSchema = 'Awaiting Extraction...';
  let nodesCount = 0;
  let edgesCount = 0;
  let schemaTypesCount = currentMode === 'mesh'
    ? 0
    : Number(document.getElementById('branch-count')?.value || 4);
  const durations = [];

  for (const log of logs) {
    const stage = log.stage || '';
    const msg = log.message || '';
    const details = log.details || {};

    if (stage === 'round_start' && details.round !== undefined) {
      currentTick = details.round;
    } else if (stage === 'tick' && details.tick !== undefined) {
      currentTick = details.tick;
    } else if (msg.includes('Starting Round') || msg.includes('Round')) {
      const match = msg.match(/Round\s+(\d+)/i);
      if (match) currentTick = parseInt(match[1], 10);
    } else if (msg.includes('Tick') && msg.includes('started')) {
      const match = msg.match(/Tick\s+(\d+)/i);
      if (match) currentTick = parseInt(match[1], 10);
    }

    if (details.domain) {
      determinedField = details.domain.toUpperCase();
    } else if (msg.includes('matched with')) {
      const match = msg.match(/matched with\s+([A-Za-z0-9_]+)\s+domain/i);
      if (match) determinedField = match[1].toUpperCase();
    } else if (msg.includes('domain')) {
      const match = msg.match(/domain:\s*([A-Za-z0-9_]+)/i);
      if (match) determinedField = match[1].toUpperCase();
    }

    if (details.branches && Array.isArray(details.branches)) {
      activeSchema = details.branches.join(' | ');
    }

    if (details.nodes !== undefined) {
      nodesCount = details.nodes;
    }
    if (details.edges !== undefined) {
      edgesCount = details.edges;
    }
    if (details.schemaTypes !== undefined) {
      if (Array.isArray(details.schemaTypes)) {
        schemaTypesCount = details.schemaTypes.length;
        activeSchema = details.schemaTypes.join(' | ');
      } else {
        schemaTypesCount = details.schemaTypes;
      }
    }
    if (details.edgesCount !== undefined) edgesCount = details.edgesCount;

    // Count incremental edges in mesh mode
    if (currentMode === 'mesh' && (msg.includes('posted:') || msg.includes('reacted:'))) {
      edgesCount++;
    }

    if (msg.includes('Knowledge Graph built:')) {
      const match = msg.match(/(\d+)\s+Nodes,\s+(\d+)\s+Edges,\s+(\d+)\s+Schema Types/i);
      if (match) {
        nodesCount = parseInt(match[1], 10);
        edgesCount = parseInt(match[2], 10);
        schemaTypesCount = parseInt(match[3], 10);
      }
    }

    if (stage === 'round_end' && details.duration !== undefined) {
      const roundNum = details.round || durations.length + 1;
      if (!durations.some(d => d.label === `Round ${roundNum}`)) {
        durations.push({ label: `Round ${roundNum}`, duration: details.duration });
      }
    } else if (stage === 'tick_end' && details.duration !== undefined) {
      const tickNum = details.tick || durations.length + 1;
      if (!durations.some(d => d.label === `Tick ${tickNum}`)) {
        durations.push({ label: `Tick ${tickNum}`, duration: details.duration });
      }
    } else if (stage === 'phase_end' && details.duration !== undefined) {
      const phase = details.phase || `Phase ${durations.length + 1}`;
      const label = phase.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (!durations.some(d => d.label === label)) {
        durations.push({ label, duration: details.duration });
      }
    } else if (msg.includes('completed in') && msg.includes('s')) {
      const match = msg.match(/(Round|Tick)\s+(\d+)\s+completed in\s+([\d.]+)\s*s/i);
      if (match) {
        const label = `${match[1]} ${match[2]}`;
        const duration = match[3];
        if (!durations.some(d => d.label === label)) {
          durations.push({ label, duration });
        }
      }
    }
  }

  let graphDensity = `${edgesCount} relations / ${nodesCount} nodes`;
  if (schemaTypesCount > 0) {
    graphDensity += ` (${schemaTypesCount} schemas)`;
  }

  return {
    currentTick,
    maxTicks,
    determinedField,
    activeSchema,
    graphDensity,
    durations
  };
}

// ── Boot ─────────────────────────────────────────────────────────────
const btnSamples = document.getElementById('btn-samples');
const samplesToolbar = document.getElementById('samples-toolbar');
if (btnSamples && samplesToolbar) {
  btnSamples.addEventListener('click', () => {
    const isHidden = samplesToolbar.style.display === 'none' || samplesToolbar.style.display === '';
    samplesToolbar.style.display = isHidden ? 'flex' : 'none';
    btnSamples.classList.toggle('active', isHidden);
  });
}

document.querySelectorAll('[data-sample]').forEach(btn => {
  btn.addEventListener('click', () => setSample(btn.dataset.sample));
});

function showErrorModal(title, message, primaryAction = null) {
  const modal = document.getElementById('error-modal');
  document.getElementById('error-modal-title').textContent = title;
  document.getElementById('error-modal-message').textContent = message;

  const primaryBtn = document.getElementById('error-modal-btn-primary');
  if (primaryAction) {
    primaryBtn.style.display = 'inline-block';
    primaryBtn.textContent = primaryAction.label;
    primaryBtn.onclick = () => {
      primaryAction.action();
      modal.style.display = 'none';
    };
  } else {
    primaryBtn.style.display = 'none';
  }

  modal.style.display = 'flex';
}

document.getElementById('error-modal-close').addEventListener('click', () => {
  document.getElementById('error-modal').style.display = 'none';
});
document.getElementById('error-modal-btn-cancel').addEventListener('click', () => {
  document.getElementById('error-modal').style.display = 'none';
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  const btnRun = document.getElementById('btn-run');
  const isCancel = btnRun.textContent.startsWith('Cancel ') || btnRun.textContent.startsWith('CANCEL ');

  if (isCancel) {
    if (currentMode === 'router' || currentMode === 'divergence') {
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      // Explicitly kill the in-flight job on the server — don't rely on TCP close detection
      const cancelEndpoint = currentMode === 'router'
        ? '/api/v4/automation/router/cancel'
        : '/api/v4/automation/divergence/cancel';
      fetch(cancelEndpoint, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${_treeGetToken()}` }
      }).catch(err => console.error('Failed to send server-side cancel signal:', err));
    } else {
      await cancelJob();
    }
    return;
  }

  const cancelText = getCancelLabel(currentMode);
  btnRun.textContent = cancelText;
  btnRun.style.backgroundColor = '#e05c5c';
  btnRun.style.color = 'white';
  btnRun.style.borderColor = '#e05c5c';

  runScenario().then(() => {
    btnRun.textContent = getRunLabel(currentMode);
    btnRun.style.backgroundColor = '';
    btnRun.style.color = '';
    btnRun.style.borderColor = '';
  }).catch(err => {
    btnRun.textContent = getRunLabel(currentMode);
    btnRun.style.backgroundColor = '';
    btnRun.style.color = '';
    btnRun.style.borderColor = '';

    if (err.message === 'Simulation Cancelled by user.' || err.name === 'AbortError' || err.message.includes('aborted')) {
      logConsole('SIMULATION CANCELLED.', 'system');
      renderEmptyState(currentMode);
      return;
    }

    logConsole(err.message, 'error');
    if (err.message.includes('INSUFFICIENT_TOKENS')) {
      showErrorModal(
        'Payment Required',
        err.message.replace('INSUFFICIENT_TOKENS: ', ''),
        {
          label: 'BUY TOKENS',
          action: showProfilePage
        }
      );
      results.innerHTML = `<div class="card" style="border-color:var(--accent-orange);color:var(--accent-orange)">SIMULATION HALTED: Insufficient Tokens.</div>`;
    } else {
      results.innerHTML = `<div class="card" style="border-color:var(--accent-orange);color:var(--accent-orange)">ERROR: ${err.message}</div>`;
    }
  });
});

setSample('startup');
setMode('router');
refreshRuns();

// ── User Controls & Auth ─────────────────────────────────────────────
async function loadProfile() {
  try {
    const res = await fetch('/api/v4/user/profile');
    if (!res.ok) return;
    const data = await res.json();
    userTokens = Number(data.tokens) || 0;
    if (typeof updateTreeForecast === 'function') {
      updateTreeForecast();
    }

    const emailEl = document.getElementById('profile-email-main');
    if (emailEl) emailEl.textContent = data.email;
    const tokensEl = document.getElementById('profile-tokens-main');
    if (tokensEl) tokensEl.textContent = data.tokens;

    if (data.isAdmin) {
      document.getElementById('btn-admin').style.display = 'inline-flex';
    }

    if (data.hasPendingRequest) {
      ['basic', 'pro', 'enterprise'].forEach(type => {
        const btn = document.getElementById(`btn-buy-${type}`);
        if (btn) {
          btn.disabled = true;
          btn.style.opacity = '0.5';
          btn.textContent = 'PENDING APPROVAL';
          btn.title = 'You have a pending request. Please wait for admin approval.';
        }
      });
    } else {
      ['basic', 'pro', 'enterprise'].forEach(type => {
        const btn = document.getElementById(`btn-buy-${type}`);
        if (btn) {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.textContent = 'CLAIM';
          btn.title = '';
        }
      });
    }

    // Fetch usage history
    const histRes = await fetch('/api/v4/user/simulations');
    if (histRes.ok) {
      const histData = await histRes.json();
      const listEl = document.getElementById('profile-history-list');
      if (listEl) {
        if (!histData.simulations || histData.simulations.length === 0) {
          listEl.innerHTML = '<span style="color:var(--text-secondary);">No simulation history found.</span>';
        } else {
          listEl.innerHTML = `
            <div style="background:#fff; border:1px solid var(--border-color); border-radius:4px; overflow:hidden;">
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;">
                <thead style="background:var(--bg-main); color:var(--text-secondary); border-bottom:1px solid var(--border-color); font-family:var(--font-mono); font-size:0.75rem; text-transform:uppercase;">
                  <tr>
                    <th style="padding:0.8rem 1rem;">Date</th>
                    <th style="padding:0.8rem 1rem;">Type</th>
                    <th style="padding:0.8rem 1rem; width:40%;">Query / Hypothesis</th>
                    <th style="padding:0.8rem 1rem;">Duration</th>
                    <th style="padding:0.8rem 1rem;">Tokens</th>
                    <th style="padding:0.8rem 1rem; text-align:right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${histData.simulations.map(s => {
            // Build the payload for VIEW REPORT depending on simulation type
            let payload = '{}';
            if (s.type === 'mesh') {
              payload = s.report ? JSON.stringify(s.report) : '{}';
            } else if (s.type === 'tree') {
              payload = s.report ? JSON.stringify({ _type: 'tree', ...s.report }) : '{}';
            } else {
              payload = s.global_summary
                ? JSON.stringify({ summary: s.global_summary.reason || s.global_summary, vulnerability: s.global_summary.vulnerability, snapshot: s.graph_snapshot })
                : '{}';
            }

            return `
                      <tr style="border-bottom:1px solid var(--border-color);">
                        <td style="padding:0.8rem 1rem; color:var(--text-secondary); white-space:nowrap;">${new Date(s.created_at).toLocaleDateString()} ${new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td style="padding:0.8rem 1rem; color:var(--accent-orange); font-weight:bold;">${s.type.toUpperCase()}</td>
                        <td style="padding:0.8rem 1rem; color:var(--text-primary); line-height:1.4;">${esc(s.councilal_hypothesis)}</td>
                        <td style="padding:0.8rem 1rem; color:var(--text-secondary); font-family:var(--font-mono);">${s.duration_sec}s</td>
                        <td style="padding:0.8rem 1rem; color:var(--text-secondary); font-family:var(--font-mono);">${s.tokens_used}</td>
                        <td style="padding:0.8rem 1rem; text-align:right;">
                          <button class="ghost tiny btn-view-report" data-report="${esc(payload)}" data-simid="${s.id}" data-date="${s.created_at}" data-agents="${s.agent_count}" data-ticks="${s.tick_count}">VIEW REPORT</button>
                          <button class="ghost tiny btn-delete-sim" data-simid="${s.id}" data-type="${s.type}" style="color:#e05c5c; padding: 0.2rem 0.4rem; font-size: 1rem;" title="Delete Simulation">🗑️</button>
                        </td>
                      </tr>
                    `;
          }).join('')}
                </tbody>
              </table>
            </div>
          `;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load profile', err);
  }
}

function showProfilePage() {
  const profilePage = document.getElementById('profile-page');
  // Toggle: if already on profile page, go back to previous mode
  if (profilePage.style.display === 'block') {
    homeLogoHandler();
    return;
  }
  _previousMode = currentMode;
  loadProfile();
  // Hide results, mesh feed, and interview panel, show profile page
  document.getElementById('results').style.display = 'none';
  const treeMainPanel = document.getElementById('tree-main-panel');
  if (treeMainPanel) treeMainPanel.style.display = 'none';
  const meshPanel = document.getElementById('mesh-feed-panel');
  if (meshPanel) meshPanel.classList.remove('visible');
  const interviewPanel = document.getElementById('interview-panel');
  if (interviewPanel) interviewPanel.classList.remove('visible');
  profilePage.style.display = 'block';
}

document.getElementById('btn-profile').addEventListener('click', showProfilePage);

async function buyTokens(packageType) {
  const btn = document.getElementById(`btn-buy-${packageType}`);
  const originalText = btn.textContent;
  btn.textContent = 'CLAIMING...';
  
  try {
    const res = await fetch('/api/v4/user/buy-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageType })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to request tokens');
    
    btn.textContent = 'SENT!';
    setTimeout(() => { btn.textContent = originalText; }, 2000);
    
    showErrorModal(
      'Hackathon Mode',
      'To prevent API abuse during the hackathon evaluation period, token claims are simulated. The transaction is successful in spirit. You\'re doing great! A request for this token package has been sent to the admin for your profile.'
    );
    
    loadProfile(); // Refresh profile to disable claim buttons
  } catch (err) {
    alert('Error: ' + err.message);
    btn.textContent = originalText;
  }
}

document.getElementById('btn-buy-basic')?.addEventListener('click', () => buyTokens('basic'));
document.getElementById('btn-buy-pro')?.addEventListener('click', () => buyTokens('pro'));
document.getElementById('btn-buy-enterprise')?.addEventListener('click', () => buyTokens('enterprise'));

document.getElementById('btn-admin-reset-tokens')?.addEventListener('click', () => {
  showErrorModal('Confirm Reset', 'Are you sure you want to reset ALL user tokens?', {
    label: 'YES, RESET ALL',
    action: async () => {
      try {
        const res = await fetch('/api/v4/admin/reset-tokens', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          alert(`Success! Tokens reset for ${data.affected} users.`);
          document.getElementById('btn-admin').click(); // refresh admin modal
        } else {
          alert('Error: ' + data.error);
        }
      } catch (e) { alert('Error: ' + e.message); }
    }
  });
});

document.getElementById('btn-admin-clear-db')?.addEventListener('click', () => {
  showErrorModal('Confirm Clear DB', 'Are you absolutely sure you want to CLEAR the database? This deletes all chunks and telemetry history, but keeps users.', {
    label: 'YES, CLEAR ALL',
    action: async () => {
      try {
        const res = await fetch('/api/v4/admin/clear-db', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          alert('Database graph and simulation history successfully cleared.');
          document.getElementById('btn-admin').click(); // refresh admin modal
        } else {
          alert('Error: ' + data.error);
        }
      } catch (e) { alert('Error: ' + e.message); }
    }
  });
});

document.getElementById('btn-admin').addEventListener('click', async () => {
  try {
    const [res, reqRes] = await Promise.all([
      fetch('/api/v4/admin/stats'),
      fetch('/api/v4/admin/token-requests')
    ]);
    
    if (!res.ok) throw new Error('Failed to fetch admin stats');
    const data = await res.json();
    const reqData = reqRes.ok ? await reqRes.json() : { requests: [] };

    document.getElementById('admin-total-users').textContent = data.global.totalUsers;
    document.getElementById('admin-total-sims').textContent = data.global.totalSimulations;
    document.getElementById('admin-total-duration').textContent = data.global.totalDurationSec;
    document.getElementById('admin-total-tokens').textContent = data.global.totalTokensUsed;

    const tokenReqHtml = reqData.requests.map(r => `
      <div style="border: 1px solid var(--border-color); padding: 0.8rem; background: rgba(0,0,0,0.02); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:bold; color:var(--text-primary);">${esc(r.email)}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary);">Requested <strong>${r.amount} Tokens</strong> on ${new Date(r.created_at).toLocaleString()}</div>
        </div>
        <div style="display:flex; gap:0.5rem;">
          <button class="primary tiny" onclick="resolveTokenRequest(${r.id}, 'approve')">Approve</button>
          <button class="ghost tiny" onclick="resolveTokenRequest(${r.id}, 'reject')" style="color:#e05c5c; border-color:#e05c5c;">Reject</button>
        </div>
      </div>
    `).join('');
    document.getElementById('admin-token-requests-list').innerHTML = tokenReqHtml || '<div style="font-size:0.75rem; color:var(--text-secondary);">No pending requests.</div>';

    const usersListHtml = data.users.map(u => `
      <div style="border: 1px solid var(--border-color); padding: 0.8rem; background: rgba(0,0,0,0.02);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="font-weight:bold; color:var(--text-primary);">${esc(u.email)} <span style="font-size:0.75rem; color:var(--text-secondary);">(${esc(u.memtrace_uuid)})</span></div>
          <button class="ghost tiny" onclick="clearUserDb('${u.memtrace_uuid}', '${esc(u.email)}')" title="Clear this user's DB entries" style="color:#e05c5c; border-color:#e05c5c; padding: 0.1rem 0.4rem;">🗑️</button>
        </div>
        <div style="display:flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.85rem; font-family:var(--font-mono);">
          <span><strong>Tokens Left:</strong> ${u.tokens}</span>
          <span><strong>Sims:</strong> ${u.stats?.sim_count || 0}</span>
          <span><strong>Tokens Used:</strong> ${u.stats?.tokens || 0}</span>
        </div>
        <div style="margin-top: 0.5rem;">
          <button class="ghost tiny" onclick="loadUserSimulations('${u.memtrace_uuid}')">View Simulations</button>
        </div>
        <div id="admin-sims-${u.memtrace_uuid}" style="margin-top: 0.5rem; display:none; flex-direction:column; gap:0.5rem; font-size:0.8rem;"></div>
      </div>
    `).join('');
    document.getElementById('admin-users-list').innerHTML = usersListHtml;

    document.getElementById('admin-modal').style.display = 'flex';
  } catch (e) {
    alert(e.message);
  }
});

window.loadUserSimulations = async function (uuid) {
  const container = document.getElementById(`admin-sims-${uuid}`);
  if (container.style.display === 'flex') {
    container.style.display = 'none';
    return;
  }

  try {
    container.innerHTML = '<span style="color:var(--text-secondary);">Loading...</span>';
    container.style.display = 'flex';

    const res = await fetch(`/api/v4/admin/user/${uuid}/simulations`);
    if (!res.ok) throw new Error('Failed to load simulations');
    const data = await res.json();

    if (!data.simulations || data.simulations.length === 0) {
      container.innerHTML = '<span style="color:var(--text-secondary);">No simulations found.</span>';
      return;
    }

    container.innerHTML = data.simulations.map(s => `
      <div style="background:#fff; border:1px solid var(--border-color); padding:0.5rem; margin-top:0.3rem;">
        <div style="display:flex; justify-content:space-between; font-weight:bold; margin-bottom:0.3rem;">
          <span style="color:var(--accent-orange);">${s.type.toUpperCase()}</span>
          <span style="font-size:0.7rem; color:var(--text-secondary);">${new Date(s.created_at).toLocaleString()}</span>
        </div>
        <div style="margin-bottom:0.3rem;"><strong>Hypothesis:</strong> ${esc(s.councilal_hypothesis)}</div>
        <div style="margin-bottom:0.3rem;"><strong>Verdict/Summary:</strong> ${esc(s.summary)}</div>
        <div style="font-family:var(--font-mono); font-size:0.7rem; color:#666; display:flex; gap:0.8rem;">
          <span>Tokens: ${s.tokens_used}</span>
          <span>Rounds/Ticks: ${s.tick_count}</span>
          <span>Agents: ${s.agent_count}</span>
          <span>Duration: ${s.duration_sec}s</span>
        </div>
      </div>
    `).join('');

  } catch (e) {
    container.innerHTML = `<span style="color:#e05c5c;">${e.message}</span>`;
  }
};

document.getElementById('btn-clear-screen').addEventListener('click', () => {
  if (currentMode === 'tree') {
    const flowCont = document.getElementById('tree-flow-content');
    const resultsCont = document.getElementById('tree-results-container');
    if (flowCont) {
      flowCont.style.padding = '0';
      flowCont.style.position = 'relative';
      flowCont.style.minHeight = 'calc(100vh - 2rem)';
      flowCont.innerHTML = TREE_EMPTY_STATE;
    }
    if (resultsCont) resultsCont.style.display = 'none';

    if (typeof currentTutorialCleanup === 'function') {
      currentTutorialCleanup();
      currentTutorialCleanup = null;
    }
    setTimeout(() => {
      const tutCanvas = document.getElementById('tree-physics-canvas');
      if (tutCanvas && flowCont) {
        tutCanvas.width = flowCont.clientWidth;
        tutCanvas.height = flowCont.clientHeight;
      }
      if (typeof initTutorialPhysics === 'function') {
        currentTutorialCleanup = initTutorialPhysics('tree-physics-canvas', 'tree');
      }
    }, 50);
  } else {
    renderEmptyState(currentMode);
  }

  const meshPanel = document.getElementById('mesh-feed-panel');
  if (meshPanel) meshPanel.classList.remove('visible');
  const interviewPanel = document.getElementById('interview-panel');
  if (interviewPanel) interviewPanel.classList.remove('visible');
  const interviewLog = document.getElementById('interview-log');
  if (interviewLog) interviewLog.innerHTML = '<p style="color:var(--text-secondary);font-size:.78rem;font-style:italic;">No cross-examinations this run — all personas committed to a firm stance on first evaluation.</p>';

  if (currentMode === 'council') currentCouncilSimId = null;
  else if (currentMode === 'mesh') currentMeshSimId = null;
  else if (currentMode === 'tree') {
    modeStatus.tree = 'idle';
    if (typeof _treeData !== 'undefined') window._treeData = null; // Assuming _treeData is global or available
  }
});

const homeLogoHandler = () => {
  document.getElementById('profile-page').style.display = 'none';
  // Restore to the mode we were in before opening profile
  const modeToRestore = _previousMode || currentMode;
  if (modeToRestore === 'tree') {
    const treeMainPanel = document.getElementById('tree-main-panel');
    if (treeMainPanel) treeMainPanel.style.display = 'flex';
  } else {
    document.getElementById('results').style.display = 'block';
    if (modeToRestore === 'mesh') {
      const meshPanel = document.getElementById('mesh-feed-panel');
      if (meshPanel && currentMeshSimId) meshPanel.classList.add('visible');
    } else {
      const interviewPanel = document.getElementById('interview-panel');
      if (interviewPanel && currentCouncilSimId) interviewPanel.classList.add('visible');
    }
  }
  _previousMode = null;
};
document.getElementById('btn-home-logo-status')?.addEventListener('click', homeLogoHandler);
document.getElementById('btn-home-logo-title')?.addEventListener('click', homeLogoHandler);



// Extension button logic
const btnExtension = document.getElementById('btn-extension');
const extensionOverlay = document.getElementById('extension-overlay');
const btnCloseExtension = document.getElementById('btn-close-extension');

if (btnExtension && extensionOverlay) {
  btnExtension.addEventListener('click', () => {
    extensionOverlay.style.display = extensionOverlay.style.display === 'none' ? 'flex' : 'none';
  });
}

// Router and Divergence Mode selection is handled via setMode in the main toggle wiring.

// Modes toggle button logic
const btnModesToggle = document.getElementById('btn-modes-toggle');
const modesSetA = document.getElementById('modes-set-a');
const modesSetB = document.getElementById('modes-set-b');
if (btnModesToggle && modesSetA && modesSetB) {
  btnModesToggle.addEventListener('click', () => {
    if (modesSetA.style.display !== 'none') {
      modesSetA.style.display = 'none';
      modesSetB.style.display = 'flex';
    } else {
      modesSetA.style.display = 'flex';
      modesSetB.style.display = 'none';
    }
  });
}

if (btnCloseExtension && extensionOverlay) {
  btnCloseExtension.addEventListener('click', () => {
    extensionOverlay.style.display = 'none';
  });
}

const extThemeSwitch = document.getElementById('ext-theme-switch');
if (extThemeSwitch) {
  // Set initial state from localStorage
  extThemeSwitch.checked = localStorage.getItem('memtrace-dark') === 'true';

  extThemeSwitch.addEventListener('change', (e) => {
    const iframe = document.querySelector('#extension-overlay iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'TOGGLE_THEME', dark: e.target.checked }, '*');
    }
  });
}

document.getElementById('btn-admin').addEventListener('click', async () => {
  document.getElementById('admin-modal').style.display = 'flex';
});
// Use event delegation for dynamically created buttons
document.addEventListener('click', async (e) => {
  // VIEW REPORT BUTTON
  if (e.target.closest('.btn-view-report')) {
    const btn = e.target.closest('.btn-view-report');
    const rawPayload = btn.getAttribute('data-report');
    const simId = btn.getAttribute('data-simid');
    const date = new Date(btn.getAttribute('data-date')).toLocaleString();
    const agents = btn.getAttribute('data-agents');
    const ticks = btn.getAttribute('data-ticks');

    let displayHtml = '';
    try {
      const parsed = JSON.parse(rawPayload);
      const actualTicks = parsed.totalInteractions || ticks;

      // ── TREE REPORT ─────────────────────────────────────────────
      if (parsed._type === 'tree') {
        const futures = parsed.dominantFutures || [];
        let expectedChanges = parsed.decisionSpace?.expectedChanges || [];
        const treeNodes = parsed.tree?.nodes || [];

        // Dynamically compute expected changes if empty (format shift fallback)
        if (expectedChanges.length === 0 && treeNodes.length > 0) {
          const rootState = treeNodes.find(n => n.depth === 0) || treeNodes[0];
          const varNames = Object.keys(rootState?.variables || {});
          expectedChanges = varNames.map(varName => {
            const values = treeNodes.map(n => n.variables?.[varName]).filter(v => typeof v === 'number');
            if (values.length === 0) return null;
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const rootVal = rootState.variables?.[varName] ?? 0.5;
            const delta = mean - rootVal;
            const humanName = (parsed.decisionSpace?.variable_labels?.[varName]) || varName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            return { name: humanName, delta };
          }).filter(Boolean).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        }

        const futuresHtml = futures.map((f, i) => {
          const name = f.title || f.futureName || f.name || `Future ${i + 1}`;
          const prob = f.probability_percent !== undefined ? f.probability_percent : ((f.probability || 0) * 100).toFixed(0);
          const risk = f.main_risk || f.mainRisk || f.risk || '—';
          const upside = f.main_upside || f.mainUpside || f.upside || '—';
          const narrative = f.outcome || f.narrative || f.description || '';
          return `
            <div style="padding:1rem; margin-bottom:0.75rem; background:rgba(124,124,124,0.07); border-left:3px solid #7c7c7c; border-radius:0 4px 4px 0;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                <strong style="color:#fff;">${esc(name)}</strong>
                <span style="font-family:var(--font-mono); font-size:0.8rem; color:#7c7c7c;">${prob}% PROBABILITY</span>
              </div>
              ${narrative ? `<div style="color:var(--text-secondary); font-size:0.85rem; line-height:1.5; margin-bottom:0.5rem;">${esc(narrative)}</div>` : ''}
              <div style="display:flex; gap:1rem; font-size:0.8rem; font-family:var(--font-mono);">
                <span style="color:#e05c5c;">⚠ ${esc(risk)}</span>
                <span style="color:#3ecfb2;">✦ ${esc(upside)}</span>
              </div>
            </div>`;
        }).join('');

        const changesHtml = expectedChanges.length > 0
          ? expectedChanges.map(c => {
            const label = c.variable || c.name || c;
            const delta = c.delta !== undefined ? (c.delta > 0 ? `+${(c.delta * 100).toFixed(0)}%` : `${(c.delta * 100).toFixed(0)}%`) : '';
            const color = c.delta >= 0 ? '#3ecfb2' : '#e05c5c';
            return `<div style="display:flex; justify-content:space-between; padding:0.3rem 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.83rem;">
              <span style="color:var(--text-secondary);">${esc(String(label))}</span>
              <span style="font-family:var(--font-mono); color:${color}; font-weight:bold;">${delta}</span>
            </div>`;
          }).join('')
          : '<div style="color:var(--text-secondary); font-size:0.83rem;">No expected change data recorded.</div>';

        const whatsNextHtml = treeNodes.length > 0
          ? treeNodes.slice(0, 8).map(n => {
            const op = n.operator || n.action || '';
            const p = n.probability !== undefined ? `${((n.probability || 0) * 100).toFixed(0)}%` : '';
            return `<div style="display:flex; justify-content:space-between; align-items:center; padding:0.3rem 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.82rem;">
              <span style="color:var(--text-primary); font-family:var(--font-mono);">${esc(op)}</span>
              <span style="color:#7c7c7c; font-family:var(--font-mono);">${p}</span>
            </div>`;
          }).join('')
          : '<div style="color:var(--text-secondary); font-size:0.83rem;">No causal path data.</div>';

        displayHtml = `
          <div style="margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:1px solid var(--border-color); font-family:var(--font-mono); font-size:0.8rem;">
            <div><strong>Sim ID:</strong> ${simId}</div>
            <div><strong>Generated At:</strong> ${date}</div>
            <div><strong>Mode:</strong> TREE — Causal Forecasting</div>
          </div>
          <div style="font-size:0.8rem; color:#7c7c7c; font-family:var(--font-mono); letter-spacing:0.05em; margin-bottom:0.75rem;">DOMINANT FUTURES</div>
          ${futuresHtml || '<div style="color:var(--text-secondary);">No futures data.</div>'}
          <div style="margin-top:1.5rem; font-size:0.8rem; color:#7c7c7c; font-family:var(--font-mono); letter-spacing:0.05em; margin-bottom:0.75rem;">EXPECTED CHANGE FROM CURRENT SITUATION</div>
          ${changesHtml}
          <div style="margin-top:1.5rem; font-size:0.8rem; color:#7c7c7c; font-family:var(--font-mono); letter-spacing:0.05em; margin-bottom:0.75rem;">WHAT HAPPENS NEXT — CAUSAL PATH</div>
          ${whatsNextHtml}
        `;

      } else {
        // ── MESH / COUNCIL REPORT ────────────────────────────────────
        const verdict = parsed.verdict || parsed.summary || parsed;
        const isCouncil = !!parsed.snapshot;

        const stance = isCouncil
          ? `<div style="color: var(--accent-blue); font-weight: bold; margin-bottom: 0.5rem;">COUNCIL VERDICT</div>`
          : (verdict.stance ? `<div style="color: var(--accent-orange); font-weight: bold; margin-bottom: 0.5rem;">STANCE: ${verdict.stance.toUpperCase()}</div>` : '');
        const summaryText = verdict.summary || verdict.title || (typeof verdict === 'string' ? verdict : 'No summary available.');
        const topic = verdict.decisiveTopic ? `<div style="margin-top: 1rem;"><strong>Decisive Topic:</strong> <span style="color:var(--text-primary);">${verdict.decisiveTopic}</span></div>` : '';
        const confidence = verdict.confidence ? `<div style="margin-top: 0.5rem;"><strong>Confidence:</strong> <span style="color:var(--text-primary);">${verdict.confidence}%</span></div>` : '';

        let loudestConcern = '';
        if (verdict.loudestConcern) {
          loudestConcern = `
          <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(0,0,0,0.2); border-left: 2px solid #e05c5c;">
            <div style="font-size: 0.8rem; color: #e05c5c; font-family: var(--font-mono); margin-bottom: 0.5rem;">LOUDEST CONCERN // ${verdict.loudestConcern.name}</div>
            <div style="font-style: italic;">"${verdict.loudestConcern.concern}"</div>
          </div>
        `;
        }

        let councilalVulnerability = '';
        if (parsed.vulnerability) {
          councilalVulnerability = `
          <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(0,0,0,0.2); border-left: 2px solid #e05c5c;">
            <div style="font-size: 0.8rem; color: #e05c5c; font-family: var(--font-mono); margin-bottom: 0.5rem;">COUNCILAL VULNERABILITY</div>
            <div style="color: var(--text-primary); line-height: 1.5;">${parsed.vulnerability}</div>
          </div>
        `;
        }

        displayHtml = `
        <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color); font-family: var(--font-mono); font-size: 0.8rem;">
          <div><strong>Sim ID:</strong> ${simId}</div>
          <div><strong>Generated At:</strong> ${date}</div>
          <div><strong>Agent Count:</strong> ${agents}</div>
          <div><strong>Total Iterations:</strong> ${actualTicks}</div>
        </div>
        <div style="font-size: 0.95rem; line-height: 1.6;">
          ${stance}
          <div style="color: var(--text-primary);">${summaryText}</div>
          ${topic}
          ${confidence}
          ${loudestConcern}
          ${councilalVulnerability}
        </div>
      `;
      } // end mesh/council
    } catch (err) {
      displayHtml = `<pre style="white-space: pre-wrap;">${rawPayload}</pre>`;
    }

    document.getElementById('report-modal-content').innerHTML = displayHtml;
    document.getElementById('report-modal').style.display = 'flex';
  }

  // DELETE SIMULATION BUTTON (Opens Modal)
  if (e.target.closest('.btn-delete-sim')) {
    const btn = e.target.closest('.btn-delete-sim');
    const simId = btn.getAttribute('data-simid');
    const type = btn.getAttribute('data-type');

    const confirmBtn = document.getElementById('btn-confirm-trash');
    confirmBtn.setAttribute('data-simid', simId);
    confirmBtn.setAttribute('data-type', type);

    // Store reference to the row so we can remove it later
    window.rowToDelete = btn.closest('tr');

    document.getElementById('trash-modal').style.display = 'flex';
  }
});

// Handle the actual confirmation of deletion
document.getElementById('btn-confirm-trash').addEventListener('click', async (e) => {
  const confirmBtn = e.target;
  const simId = confirmBtn.getAttribute('data-simid');
  const type = confirmBtn.getAttribute('data-type');

  if (!simId) return;

  const originalText = confirmBtn.innerText;
  confirmBtn.innerText = 'DELETING...';

  try {
    const res = await fetch(`/api/v4/user/simulations/${simId}?type=${type}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete simulation');

    // Remove the row from the DOM
    if (window.rowToDelete) {
      window.rowToDelete.remove();
      window.rowToDelete = null;
    }

    // If table is now empty, refresh profile to show empty state
    const tbody = document.querySelector('#profile-history-list tbody');
    if (tbody && tbody.children.length === 0) {
      loadProfile();
    }

    document.getElementById('trash-modal').style.display = 'none';
  } catch (err) {
    alert(err.message);
  } finally {
    confirmBtn.innerText = originalText;
  }
});



document.getElementById('btn-signout').addEventListener('click', async () => {
  try {
    localStorage.removeItem('simulith_token');
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) { }
  window.location.href = '/simulith/login.html';
});

// Load profile on start
loadProfile();

// ══════════════════════════════════════════════════════════════════
//  TREE MODE UI LOGIC
// ══════════════════════════════════════════════════════════════════

let _treeData = null;

function _t(id) { return document.getElementById(id); }
function _treeGetToken() { return localStorage.getItem('simulith_token'); }

document.addEventListener('DOMContentLoaded', () => {
  // Tab switching removed — Tree Mode now uses a single scrollable panel

  // ── Launch button ────────────────────────────────────────────
  const launchBtn = _t('tree-launch-btn');
  if (launchBtn) {
    launchBtn.addEventListener('click', _treeLaunch);
  }

  // ── Node drawer close ────────────────────────────────────────
  const drawerClose = _t('tree-node-drawer-close');
  if (drawerClose) {
    drawerClose.addEventListener('click', () => {
      const drawer = _t('tree-node-drawer');
      if (drawer) drawer.classList.remove('open');
    });
  }

  // ── Input Listeners for Token Forecast ───────────────────────
  const depthEl = _t('tree-depth');
  const branchEl = _t('tree-branch');
  if (depthEl) depthEl.addEventListener('input', updateTreeForecast);
  if (branchEl) branchEl.addEventListener('input', updateTreeForecast);
});

async function _treeLaunch() {
  const decision = (_t('question') || {}).value?.trim();
  const facts = (_t('facts') || {}).value?.trim() || '';
  const evidence = (_t('evidence') || {}).value?.trim() || '';
  const context = [facts, evidence].filter(Boolean).join('\n\n');
  const depth = parseInt((_t('tree-depth') || {}).value || '3', 10);
  const branching = parseInt((_t('tree-branch') || {}).value || '3', 10);

  if (!decision) { _treeSetStatus('Decision seed is required.', 'error'); return; }

  logConsole(`INITIATING CAUSAL TREE GENERATION`, 'system');
  logConsole(`SEED: ${decision}`, 'system');

  _treeSetStatus('Computing causal state space...', 'running');
  const launchBtn = _t('tree-launch-btn');
  if (launchBtn) launchBtn.disabled = true;

  modeStatus.tree = 'loading';
  _treeData = null;

  // Show loading state
  const flowCont = _t('tree-flow-content');
  if (flowCont) {
    flowCont.style.padding = '1.2rem';
    flowCont.style.position = 'static';
    flowCont.style.minHeight = 'auto';
    flowCont.innerHTML = TREE_LOADING_STATE;
    flowCont.style.display = 'block';
  }

  // Start Telemetry
  currentTelemetry = {
    status: 'running',
    currentTick: 0,
    maxTicks: (() => {
      let sum = 0;
      for (let k = 0; k <= depth; k++) sum += Math.pow(branching, k);
      return sum;
    })(),
    llmCallCount: 0,
    elapsed: '0.0s',
    determinedField: 'AUTO-DETECTING...',
    activeSchema: 'CAUSAL DETERMINISTIC MODEL',
    graphDensity: '0 nodes computed',
    durations: []
  };
  startTelemetryTimer();

  try {
    logConsole(`PHYSICS ENGINE BOUNDING VARIABLES...`, 'system');
    const res = await fetch('/api/v4/automation/router', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'tree',
        question: decision,
        facts: context ? [context] : [],
        depth,
        branchingFactor: branching
      })
    });
    if (!res.ok) {
      let errorMessage = 'Tree simulation failed';
      try {
        const errorData = await res.json();
        errorMessage = errorData.error || errorMessage;
      } catch(e) {
        errorMessage = `Gateway Error: ${res.status} ${res.statusText}`;
      }
      if (res.status === 402) throw new Error(`INSUFFICIENT_TOKENS: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    logConsole(`MCTS PRUNING ACTIVE...`, 'system');
    const _routerData = await res.json();
    _treeData = _routerData.simulation_result;

    currentTelemetry.determinedField = (_treeData.domain || 'UNKNOWN').toUpperCase();
    currentTelemetry.status = 'completed';
    currentTelemetry.graphDensity = `${_treeData.tree.nodes.length} nodes computed`;
    currentTelemetry.llmCallCount = _treeData.llmCallCount || 0;
    if (currentTelemetry.durations.length === 0 && currentTelemetry.elapsed && currentTelemetry.elapsed !== '0.0s') {
      currentTelemetry.durations.push({ label: 'Tree Generation', duration: currentTelemetry.elapsed.replace('s', '') });
    }
    stopTelemetryTimer();
    updateTelemetryUI(currentTelemetry);

    logConsole(`CAUSAL TREE GENERATION COMPLETE. ${_treeData.tree.nodes.length} STATES IDENTIFIED.`, 'success');
    _treeSetStatus(`Tree expanded — ${_treeData.tree.nodes.length} states computed.`);
    logConsole(`DOMINANT FUTURES READY: ${(_treeData.dominantFutures || []).length} PATHS EXPLAINED.`, 'success');

    const varLabels = (_treeData.decisionSpace || {}).variable_labels || {};

    // ── Panel 1: Dominant Futures ─────────────────────────────
    if (flowCont) {
      flowCont.style.padding = '1.2rem';
      flowCont.style.position = 'static';
      flowCont.style.minHeight = 'auto';
      flowCont.innerHTML = renderDominantFuturesHtml(
        _treeData.dominantFutures || [],
        _treeData.decisionSpace || {}
      );
    }

    const resultsCont = document.getElementById('tree-results-container');
    if (resultsCont) resultsCont.style.display = 'block';

    // ── Panel 2: How Your Situation Could Change ─────────────
    const scatterEl = _t('tree-scatter-content');
    if (scatterEl) {
      scatterEl.innerHTML = renderTreeFlowHtml(_treeData.tree.nodes, _treeData.root_state, varLabels);
    }

    // ── Panel 3: Causal DAG ──────────────────────────────────
    const svgCont = _t('tree-svg-container');
    if (svgCont) {
      svgCont.innerHTML = renderTreeCausalSvg(_treeData.tree.nodes);
      const nodeMap = Object.fromEntries(_treeData.tree.nodes.map(n => [n.id, n]));
      svgCont.querySelectorAll('.tree-node-g').forEach(g => {
        g.addEventListener('click', () => {
          const node = _treeData.tree.nodes.find(n => n.id === g.dataset.nodeid);
          if (!node) return;
          const chain = [];
          let cur = node;
          while (cur) { chain.unshift(cur); cur = cur.parent ? nodeMap[cur.parent] : null; }
          _treeOpenDrawer(node, chain);
        });
      });
    }

  } catch (err) {
    modeStatus.tree = 'idle';
    currentTelemetry.status = 'failed';
    stopTelemetryTimer();
    updateTelemetryUI(currentTelemetry);
    _treeSetStatus('Error: ' + err.message, 'error');
    console.error('[TreeViz]', err);
  } finally {
    modeStatus.tree = modeStatus.tree === 'loading' ? 'idle' : modeStatus.tree;
    stopTelemetryTimer();
    if (launchBtn) launchBtn.disabled = false;
  }
}


function _treeSetStatus(msg, type = '') {
  const el = _t('tree-status-line');
  if (!el) return;
  el.textContent = msg;
  el.className = type === 'running' ? 'tree-running' : type === 'error' ? 'tree-error' : '';
}

function _treeOpenDrawer(node, chain) {
  const el = _t('tree-node-drawer-content');
  if (!el) return;
  el.innerHTML = renderTreeDrawerHtml(node, chain);
  const drawer = _t('tree-node-drawer');
  if (drawer) drawer.classList.add('open');
}

function updateTreeForecast() {
  const depthEl = _t('tree-depth');
  const branchEl = _t('tree-branch');
  if (!depthEl || !branchEl) return;
  const depth = parseInt(depthEl.value || '3', 10);
  const branch = parseInt(branchEl.value || '3', 10);

  let forecasted = 3;
  for (let k = 0; k < depth; k++) {
    forecasted += Math.pow(branch, k) + 2 * Math.pow(branch, k + 1);
  }

  const launchBtn = _t('tree-launch-btn');
  if (userTokens < forecasted) {
    _treeSetStatus(`⚠️ Forecast: ${forecasted} tokens needed (You have ${userTokens}).`, 'error');
    if (launchBtn) {
      launchBtn.style.opacity = '0.5';
      launchBtn.disabled = true;
    }
  } else {
    const el = _t('tree-status-line');
    if (el) {
      el.textContent = `Forecast: ${forecasted} tokens. Ready.`;
      el.className = '';
    }
    if (launchBtn) {
      launchBtn.style.opacity = '1';
      launchBtn.disabled = false;
    }
  }
}

window.clearUserDb = function(uuid, email) {
  showErrorModal('Confirm Clear User DB', `Are you absolutely sure you want to CLEAR the database for user ${email}? This deletes all their chunks and telemetry history, but keeps their profile and tokens.`, {
    label: 'YES, CLEAR DATA',
    action: async () => {
      try {
        const res = await fetch('/api/v4/admin/clear-db', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUuid: uuid })
        });
        const data = await res.json();
        if (res.ok) {
          alert(`Database graph and simulation history successfully cleared for ${email}.`);
          document.getElementById('btn-admin').click(); // refresh admin modal
        } else {
          alert('Error: ' + data.error);
        }
      } catch (e) { alert('Error: ' + e.message); }
    }
  });
};

window.resolveTokenRequest = async function(requestId, action) {
  try {
    const res = await fetch('/api/v4/admin/resolve-token-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, action })
    });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('btn-admin').click(); // refresh modal to remove the resolved request
    } else {
      alert('Error: ' + data.error);
    }
  } catch (e) { alert('Error: ' + e.message); }
};
