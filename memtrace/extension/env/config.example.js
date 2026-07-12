/* ==================================================================
   extension/env/config.js
   Centralized Configuration & DNA of the MemTrace Engine
   ================================================================== */

export const DEFAULT_CONFIG = {
    // --- Server & Infrastructure ---
    port: parseInt(process.env.PORT || '3106'), // Port for the API server (e.g., localhost:3106)
    db_type: process.env.DB_TYPE || 'offline', // offline (SQLite) or online (cloud DB)
    online_db_provider: process.env.ONLINE_DB_PROVIDER || 'alibaba', // If online: 'alibaba' (RDS), 'turso' (Remote SQLite), or 'postgres'
    db_path: process.env.DB_PATH || 'data/memtrace.sqlite', // Filepath for local offline SQLite database
    database_url: process.env.DATABASE_URL || '',  // Connection string for Alibaba or Postgres
    turso_auth_token: process.env.TURSO_AUTH_TOKEN || '', // Auth token specifically for Turso edge databases
    google_client_id: process.env.GOOGLE_CLIENT_ID || '', // Google OAuth Client ID for frontend login
    node_env: process.env.NODE_ENV || 'development', // 'development' (verbose logging) or 'production' (fast, hides errors)

    // --- AI / LLM Orchestration ---
    llm_provider: process.env.LLM_PROVIDER || 'localllm', // The LLM engine: gemini, openai, openrouter, localllm, mock, qwen
    llm_model: process.env.LLM_MODEL || 'LFM2-2.6B-Q5', // The specific model name to load (e.g. LFM2-2.6B-Q5)
    emb_provider: process.env.EMB_PROVIDER || 'xenova',   // The Embedding engine: xenova (local transformers), openai, gemini, mock, qwen
    apiKey: process.env.API_KEY || 'xx-xx', // Unified secret key sent OUTBOUND to OpenAI/Qwen/etc
    max_tokens: parseInt(process.env.MAX_TOKENS || '2048'), // Max output tokens the LLM is allowed to generate per response

    // --- Prompt Budget Limits (chars, not tokens) ---
    // Controls truncation to avoid overflowing the LLM context window.
    promptLimits: {
        backstory: parseInt(process.env.PROMPT_BACKSTORY || '150'), // Max chars for agent's core backstory injection
        facts: parseInt(process.env.PROMPT_FACTS || '200'), // Max chars per individual memory fact
        factsCount: parseInt(process.env.PROMPT_FACTS_COUNT || '3'), // Max number of facts to retrieve per prompt
        beliefs: parseInt(process.env.PROMPT_BELIEFS || '300'), // Max chars for core belief injection
        localEdges: parseInt(process.env.PROMPT_LOCAL_EDGES || '200'), // Max chars for relationship/graph edges
        globalSummary: parseInt(process.env.PROMPT_GLOBAL_SUMMARY || '300'), // Max chars for global world state
        alternateRealities: parseInt(process.env.PROMPT_ALTERNATE_REALITIES || '200'), // Max chars for hypothetical reality branches
        postContent: parseInt(process.env.PROMPT_POST_CONTENT || '300'), // Max chars for generated social media posts
        interviewHistory: parseInt(process.env.PROMPT_INTERVIEW_HISTORY || '600'), // Max chars for recent conversation history
        beliefPositions: parseInt(process.env.PROMPT_BELIEF_POSITIONS || '150'), // Max chars for stance alignment definitions
        summaryPostContent: parseInt(process.env.PROMPT_SUMMARY_POST_CONTENT || '80'), // Max chars for miniaturized summaries
        summaryPostCount: parseInt(process.env.PROMPT_SUMMARY_POST_COUNT || '8'), // Number of posts to include in a rolling summary
    },

    // --- Simulation Limits (Single Source of Truth) ---
    LIMITS: {
        council: {
            minBranches: parseInt(process.env.LIMIT_COUNCIL_MIN_BRANCHES || '3'), // Minimum logical branches an agent must consider
            maxBranches: parseInt(process.env.LIMIT_COUNCIL_MAX_BRANCHES || '8'), // Maximum logical branches allowed before truncation
            minPersonas: parseInt(process.env.LIMIT_COUNCIL_MIN_PERSONAS || '3'), // Minimum split-personalities for debate
            maxPersonas: parseInt(process.env.LIMIT_COUNCIL_MAX_PERSONAS || '12') // Maximum split-personalities allowed
        },
        mesh: {
            minAgents: parseInt(process.env.LIMIT_MESH_MIN_AGENTS || '4'), // Minimum agents required to form a valid network mesh
            maxAgents: parseInt(process.env.LIMIT_MESH_MAX_AGENTS || '40'), // Hard cap on agent population to prevent crash
            minTicks: parseInt(process.env.LIMIT_MESH_MIN_TICKS || '1'), // Minimum chronological steps per loop
            maxTicks: parseInt(process.env.LIMIT_MESH_MAX_TICKS || '15') // Maximum chronological steps per loop
        },
        tree: {
            minDepth: parseInt(process.env.LIMIT_TREE_MIN_DEPTH || '2'), // Minimum depth of conversational thought tree
            maxDepth: parseInt(process.env.LIMIT_TREE_MAX_DEPTH || '8'), // Maximum depth of thought tree
            minBranchingFactor: parseInt(process.env.LIMIT_TREE_MIN_BRANCHING_FACTOR || '2'), // Minimum children per thought node
            maxBranchingFactor: parseInt(process.env.LIMIT_TREE_MAX_BRANCHING_FACTOR || '6') // Maximum children per thought node
        }
    },

    // --- Simulation Constants (The "Logic Circuit" DNA) ---
    SIMULATION: {
        branchCount: parseInt(process.env.SIM_BRANCH_COUNT || '4'), // Standard number of divergent thoughts to generate
        personaCount: parseInt(process.env.SIM_PERSONA_COUNT || '4'), // Standard number of internal personas per agent

        weights: {
            evidence: parseFloat(process.env.SIM_WEIGHT_EVIDENCE || '1.2'), // Multiplier: How much hard evidence sways belief
            risk: parseFloat(process.env.SIM_WEIGHT_RISK || '1.1'), // Multiplier: How much perceived risk deters action
            clarity: parseFloat(process.env.SIM_WEIGHT_CLARITY || '0.8'), // Multiplier: Value of clear communication
            contradiction: parseFloat(process.env.SIM_WEIGHT_CONTRADICTION || '1.3'), // Multiplier: Penalty for hypocritical statements
            personaFit: parseFloat(process.env.SIM_WEIGHT_PERSONA_FIT || '1.0') // Multiplier: How strictly agent sticks to character
        },

        thresholds: {
            supportStance: parseFloat(process.env.SIM_THRESH_SUPPORT || '0.60'), // Minimum confidence needed to publicly support an idea (0.0 - 1.0)
            pushbackStance: parseFloat(process.env.SIM_THRESH_PUSHBACK || '0.45'), // Threshold where doubt turns into public disagreement
            skepticRisk: parseFloat(process.env.SIM_THRESH_SKEPTIC || '0.75'), // Threshold where skepticism becomes outright rejection
            expansiveRisk: parseFloat(process.env.SIM_THRESH_EXPANSIVE || '0.40') // Threshold for taking risks to expand worldview
        },

        scoring: {
            evidenceBonusWeight: parseFloat(process.env.SIM_SCORE_EVIDENCE || '2.8'), // Score bump for providing sources
            personaBonusWeight: parseFloat(process.env.SIM_SCORE_PERSONA || '34.0'), // Massive score bump for perfect character acting
            riskPenaltyWeight: parseFloat(process.env.SIM_SCORE_RISK || '0.42'), // Point deduction for risky behavior
            contradictionPenaltyFactor: parseFloat(process.env.SIM_SCORE_CONTRADICTION || '4.0'), // Severe deduction for logical contradictions
            confidenceBase: parseFloat(process.env.SIM_SCORE_CONFIDENCE_BASE || '55'), // Baseline confidence score for new agents
            uncertaintyImpact: parseFloat(process.env.SIM_SCORE_UNCERTAINTY || '5') // Variance impact of random noise
        },

        drift: {
            fragmentationThreshold: parseFloat(process.env.SIM_DRIFT_FRAG || '0.45'), // When network splits into echo chambers
            sharpeningThreshold: parseFloat(process.env.SIM_DRIFT_SHARP || '0.65'), // When opinions polarize to extremes
            marketDriftRate: parseFloat(process.env.SIM_DRIFT_RATE || '0.01') // Speed at which public opinion organically shifts
        }
    },

    // --- Offline Model Library (GGUF Mappings) ---
    // (Only used if llm_provider === 'localllm')
    offline_models: {
        'DeepSeek-R1-Distill-Qwen-7B-Q4': {
            path: 'models/deepseek-r1-distill-qwen-7b-q4_k_m.gguf',
            url: 'https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
            description: 'DeepSeek R1 7B Distill (4.68GB).'
        },
        'Gemma-4-E4B-it-Q4': {
            path: 'models/gemma-4-e4b-it-q4_k_m.gguf',
            url: 'https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf',
            description: 'Gemma 4 E4B Instruct (4.98GB).'
        },
        'Qwen3.5-4B-Q4': {
            path: 'models/qwen3.5-4b-q4_k_m.gguf',
            url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf',
            description: 'Qwen 3.5 4B (2.74GB).'
        },
        'Phi-4-mini-instruct-Q4': {
            path: 'models/phi-4-mini-instruct-q4_k_m.gguf',
            url: 'https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf',
            description: 'Phi-4-mini-instruct (2.43GB).'
        },
        'Ministral-3-3B-Q4': {
            path: 'models/ministral-3-3b-reasoning-2512-q4_k_m.gguf',
            url: 'https://huggingface.co/unsloth/Ministral-3-3B-Reasoning-2512-GGUF/resolve/main/Ministral-3-3B-Reasoning-2512-Q4_K_M.gguf',
            description: 'Ministral 3.3B Reasoning.'
        },
        'LFM2-2.6B-Q5': {
            path: 'models/lfm2-2.6b-q5_k_m.gguf',
            url: 'https://huggingface.co/LiquidAI/LFM2-2.6B-GGUF/resolve/main/LFM2-2.6B-Q5_K_M.gguf',
            description: 'Liquid Foundation Model 2 2.6B.'
        },
        'Granite-4.0-H-Micro-Q4': {
            path: 'models/granite-4.0-h-micro-q4_k_m.gguf',
            url: 'https://huggingface.co/unsloth/granite-4.0-h-micro-GGUF/resolve/main/granite-4.0-h-micro-Q4_K_M.gguf',
            description: 'Granite 4.0 H Micro 3B param 1.94GB.'
        },
    },

    use_webgpu: process.env.USE_WEBGPU === 'true', // Set to true to utilize hardware GPU for local embedding/LLMs

    // --- MemTrace Simulation Constants ---
    MEMTRACE: {
        agentCount: parseInt(process.env.MT_AGENT_COUNT || '15'), // Total number of agents alive in the simulation
        maxRounds: parseInt(process.env.MT_MAX_ROUNDS || '3'), // Max conversation volleys between agents
        simulationDays: parseInt(process.env.MT_SIM_DAYS || '3'), // How many "virtual days" the simulation lasts
        maxPlatformsPerAgent: parseInt(process.env.MT_MAX_PLATFORMS || '3'), // How many social networks an agent posts to
        interviewQuestionsCount: parseInt(process.env.MT_INTERVIEW_QUESTIONS || '3'), // Questions asked during direct interrogation
        shockThreshold: parseFloat(process.env.MT_SHOCK_THRESHOLD || '0.72'), // Required event magnitude to "shock" an agent's worldview
        num_posts_per_agent: parseInt(process.env.MT_NUM_POSTS || '3'), // Daily social media output
        posts_exposed_per_agent: parseInt(process.env.MT_POSTS_EXPOSED || '2'), // How many timeline posts an agent sees daily
        interaction_cycles: parseInt(process.env.MT_INTERACTION_CYCLES || '1'), // Deep thought cycles per day
        target_interactions_per_cycle: parseInt(process.env.MT_TARGET_INTERACTIONS || '15'), // Agent-to-agent DMs per cycle
        max_replenishments: parseInt(process.env.MT_MAX_REPLENISHMENTS || '4'), // Memory compaction limit
        tokenLimits: { // Token allocation limits for specific social mock platforms
            twitter: parseInt(process.env.MT_LIMIT_TWITTER || '300'),
            reddit: parseInt(process.env.MT_LIMIT_REDDIT || '300'),
            hn: parseInt(process.env.MT_LIMIT_HN || '300'),
            discord: parseInt(process.env.MT_LIMIT_DISCORD || '300'),
            market: parseInt(process.env.MT_LIMIT_MARKET || '300'),
            facebook: parseInt(process.env.MT_LIMIT_FACEBOOK || '300'),
            default: parseInt(process.env.MT_LIMIT_DEFAULT || '300')
        }
    }
};
