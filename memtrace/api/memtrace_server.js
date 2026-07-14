/* ==================================================================
   api/server.js
   Threadlet HTTP API
   Uses ThreadletOrchestrator for perfect logic parity.
   ================================================================== */
import express from 'express';
import { authenticate } from './auth_server.js';
import { rateLimiterMiddleware as rateLimiter } from '../extension/core/llm-limiter.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getOrCreateUser, addTokens, deductToken, refundToken } from './db_users.js';

// Initialize global context for LLM billing tracking
global.memtraceLlmContext = new AsyncLocalStorage();
global.deductMemtraceToken = deductToken;
global.refundMemtraceToken = refundToken;

import { ThreadletOrchestrator } from '../extension/core/orchestrator.js';
import { DEFAULT_CONFIG } from '../extension/env/config.js';
import { getOfflineLLM } from '../extension/llm/offline_llm.js';
import councilRouter from './council_server.js';
import meshRouter from './mesh_server.js';
import treeRouter from './tree_server.js';
import simulithRouter, { injectOrchestrator } from './simulith_server.js';
import authRouter from './auth_server.js';
import automationRouter from './automation_router.js';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOrCreateJwtSecret } from './auth_secret.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(rateLimiter);
app.disable('x-powered-by');

// === AUTHENTICATION ===
app.use('/api/auth', authRouter);

import memtraceModeRouter from './memtrace_mode_server.js';
import telemetryRouter from './telemetry_server.js';
import personaRouter from './persona_server.js';

app.use('/api/v4', councilRouter);
app.use('/api/v4', meshRouter);
app.use('/api/v4', treeRouter);
app.use('/api/v4', simulithRouter);
app.use('/api/v4', memtraceModeRouter);
app.use('/api/v4', telemetryRouter);
app.use('/api/v4', personaRouter);
app.use('/api/v4/automation', automationRouter);

// Favicon handler to prevent 404 errors
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Public config endpoint for frontend (no auth required)
app.get('/api/config', (req, res) => {
    res.json({
        google_client_id: DEFAULT_CONFIG.google_client_id,
        node_env: DEFAULT_CONFIG.node_env
    });
});

// === LLM PROXY ENDPOINTS (keeps API keys server-side) ===
import { summarizeChunk, generateTags, getEmbedding } from '../extension/core/llm_agent.js';

app.post('/api/llm/summarize', async (req, res) => {
    const { text, maxWords } = req.body;
    const summary = await summarizeChunk(text, maxWords || 75, DEFAULT_CONFIG.llm_provider, DEFAULT_CONFIG.apiKey);
    res.json({ summary });
});

app.post('/api/llm/tags', async (req, res) => {
    const { text } = req.body;
    const tags = await generateTags(text, DEFAULT_CONFIG.llm_provider, DEFAULT_CONFIG.apiKey);
    res.json({ tags });
});

app.post('/api/llm/embed', async (req, res) => {
    const { text } = req.body;
    const embedding = await getEmbedding(text, DEFAULT_CONFIG.emb_provider, DEFAULT_CONFIG.apiKey);
    res.json({ embedding });
});

app.get('/api/llm/config', (req, res) => {
    res.json({
        llm_provider: DEFAULT_CONFIG.llm_provider,
        emb_provider: DEFAULT_CONFIG.emb_provider,
        configured: !!DEFAULT_CONFIG.apiKey
    });
});

app.post('/api/llm/generate-answer', async (req, res) => {
    const { formatted, query } = req.body;
    const { buildContextForQuery } = await import('../extension/core/llm_agent.js');
    const answer = await buildContextForQuery(formatted, query, DEFAULT_CONFIG);
    res.json({ answer });
});

// Filtered config.js for app.js (only LIMITS, no secrets)
app.get('/extension/env/config.js', (req, res) => {
    res.type('js').send(`export const DEFAULT_CONFIG = { LIMITS: ${JSON.stringify(DEFAULT_CONFIG.LIMITS)} };`);
});

// Serve only whitelisted extension files (safe: .wasm is compiled binary, not source)
const extensionDir = path.join(__dirname, '..', 'extension');
const ALLOWED_EXTENSION = new Set(['/popup.html', '/popup.bundle.js']);
const WASM_SUFFIX = '.wasm';
app.use('/extension', (req, res, next) => {
    if (ALLOWED_EXTENSION.has(req.path)) return next();
    if (req.path.endsWith(WASM_SUFFIX)) return next();
    res.status(403).type('text').send('Forbidden');
}, express.static(extensionDir));

const JWT_SECRET = loadOrCreateJwtSecret();
app.use('/simulith', (req, res, next) => {
    if (req.path === '/workspace.html' || req.path === '/') {
        const token = req.cookies?.auth_token;
        if (!token) return res.redirect('/simulith/login.html');
        try {
            jwt.verify(token, JWT_SECRET);
            if (req.path === '/') return res.redirect('/simulith/workspace.html');
            next();
        } catch(e) {
            return res.redirect('/simulith/login.html');
        }
    } else if (req.path === '/login.html') {
        const token = req.cookies?.auth_token;
        if (token) {
            try {
                jwt.verify(token, JWT_SECRET);
                return res.redirect('/simulith/workspace.html');
            } catch(e) {}
        }
        next();
    } else {
        next();
    }
}, express.static(path.join(__dirname, '..', 'simulith', 'public')));

// === DB & ORCHESTRATOR INIT ===
// Removed manual DB init. Orchestrator handles it via init().

import { OrchestratorLLMAdapter } from '../simulith/src/llm/orchestrator_adapter.js';

const orchestrator = new ThreadletOrchestrator(OrchestratorLLMAdapter);
injectOrchestrator(orchestrator);

// Initialize Orchestrator (Storage + Env)
const dbType = DEFAULT_CONFIG.db_type;
const dbConfig = {
    path: DEFAULT_CONFIG.db_path,
    connectionString: DEFAULT_CONFIG.database_url,
    online_db_provider: DEFAULT_CONFIG.online_db_provider,
    auth_token: DEFAULT_CONFIG.turso_auth_token
};
// We need a dummy UUID for 'device' context if running as server? 
// Or does init take a deviceUUID that scopes the DB? 
// Memory.js initializeStorage(uuid, mode, config). 
// If we use 'server' mode, maybe UUID is ignored or used as server ID.
await orchestrator.init('server-instance', dbType === 'postgres' ? 'postgres' : dbType, dbConfig);
// === ENDPOINTS ===
app.get('/health', (req, res) => res.json({ status: 'ok', db: dbType }));

app.get('/', (req, res) => res.redirect('/simulith/'));

import coreMemoryRouter, { injectCoreDependencies } from './core_memory_server.js';
injectCoreDependencies(orchestrator, OrchestratorLLMAdapter);
app.use('/', coreMemoryRouter);

// === SERVER ===
const PORT = Number(process.env.PORT || DEFAULT_CONFIG.port || 3106);

async function startServer() {
    if (DEFAULT_CONFIG.llm_provider === 'localllm') {
        console.log(`[Server] Pre-initializing Local LLM: ${DEFAULT_CONFIG.llm_model} (Downloading if necessary)...`);
        try {
            const llm = await getOfflineLLM();
            await llm.init();
            console.log('[Server] Local LLM loaded successfully.');
        } catch (err) {
            console.error('[Server] Failed to initialize Local LLM on boot:', err);
            process.exit(1);
        }
    }

    const server = app.listen(PORT, () => console.log(`API running on ${PORT}`));
    server.keepAliveTimeout = 3600000;
    server.headersTimeout = 3605000;
    server.requestTimeout = 3600000;
    server.timeout = 3600000;
    process.on('SIGTERM', () => server.close());
}

startServer();
