/* ==================================================================
   extension/core/llm-limiter.js
   Universal LLM Rate Limiter — Single Source of Truth
   - Token Bucket + Concurrency Semaphore (per-user via AsyncLocalStorage)
   - HTTP server sliding-window middleware
   - Exponential backoff retry utility
   - Per-user context factory (createLLMRateLimiter, initLLMContext, getLLMLimiter)
   ================================================================== */

// ==================================================================
// 1. SEMAPHORE (Concurrency Control)
// ==================================================================
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }

  async acquire(signal) {
    if (signal?.aborted) throw new Error('Simulation Cancelled by user.');
    if (this.current < this.max) {
      this.current++;
      return;
    }
    await new Promise((resolve, reject) => {
      const entry = { resolve, reject };
      this.queue.push(entry);
      if (signal) {
        const onAbort = () => {
          const idx = this.queue.indexOf(entry);
          if (idx !== -1) this.queue.splice(idx, 1);
          reject(new Error('Simulation Cancelled by user.'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  release() {
    if (this.queue.length) {
      const entry = this.queue.shift();
      entry.resolve();
    } else {
      this.current--;
    }
  }
}

// ==================================================================
// 2. LLM RATE LIMITER (Token Bucket + Semaphore)
// ==================================================================
export class LLMRateLimiter {
  constructor({ rpm = 60, maxConcurrent = 3, burstAllowance = 5 } = {}) {
    this.rate = rpm / 60;
    this.tokens = burstAllowance;
    this.maxTokens = burstAllowance;
    this.lastRefill = Date.now();
    this.semaphore = new Semaphore(maxConcurrent);
    this.baseRpm = rpm;
    this.effectiveRpm = rpm;
    this.consecutiveFailures = 0;
    this.cooldownUntil = 0;
    this._recoveryTimer = setInterval(() => {
      if (this.consecutiveFailures > 0) this.consecutiveFailures--;
      if (this.effectiveRpm < this.baseRpm) {
        this.effectiveRpm = Math.min(this.baseRpm, this.effectiveRpm * 1.25);
        this.rate = this.effectiveRpm / 60;
      }
    }, 60000);
  }

  async acquire(signal) {
    if (signal?.aborted) throw new Error('Simulation Cancelled by user.');
    const now = Date.now();
    if (this.cooldownUntil > now) {
      await _abortableSleep(this.cooldownUntil - now, signal);
    }
    await this.semaphore.acquire(signal);
    await this.takeToken(signal);
  }

  release() {
    this.semaphore.release();
  }

  async takeToken(signal) {
    if (signal?.aborted) throw new Error('Simulation Cancelled by user.');
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }
    const waitMs = ((1 - this.tokens) / this.rate) * 1000;
    await _abortableSleep(waitMs, signal);
    return this.takeToken(signal);
  }

  refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsedSec * this.rate);
    this.lastRefill = now;
  }

  onRateLimited(retryAfterMs) {
    this.tokens = 0;
    this.lastRefill = Date.now() + retryAfterMs;
    this.consecutiveFailures++;
    this.cooldownUntil = Date.now() + Math.min(30000, retryAfterMs || Math.pow(2, this.consecutiveFailures) * 1000);
    this.effectiveRpm = Math.max(5, this.effectiveRpm * 0.5);
    this.rate = this.effectiveRpm / 60;
  }
}

// ==================================================================
// 3. SERVER-SIDE: Sliding Window Rate Limiter (HTTP Middleware)
// ==================================================================
const hits = new Map();
const WINDOW_MS = 60 * 1000;
const LIMIT = 500;

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of hits.entries()) {
      if (now - data.start > WINDOW_MS) hits.delete(ip);
    }
  }, WINDOW_MS);
}

export function rateLimiterMiddleware(req, res, next) {
  if (!req || !res || !next) return;

  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();

  let data = hits.get(ip);
  if (!data) {
    data = { count: 0, start: now };
    hits.set(ip, data);
  }

  if (now - data.start > WINDOW_MS) {
    data.count = 0;
    data.start = now;
  }

  data.count++;
  if (data.count > LIMIT) {
    return res.status(429).json({
      error: 'Too Many Requests',
      retryAfter: Math.ceil((data.start + WINDOW_MS - now) / 1000)
    });
  }

  next();
}

// ==================================================================
// 4. CLIENT-SIDE: Exponential Backoff Utility
// ==================================================================
export async function withBackoff(fn, maxRetries = 3, baseDelay = 1000, signal = null) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    if (signal?.aborted) {
      throw new Error('Simulation Cancelled by user.');
    }
    try {
      return await fn();
    } catch (error) {
      attempt++;

      if (error.name === 'AbortError' || error.message === 'Simulation Cancelled by user.') {
        throw error;
      }

      const isRetryable = error.message.includes('429') ||
        error.message.includes('500') ||
        error.message.includes('502') ||
        error.message.includes('503') ||
        error.message.includes('Too Many Requests') ||
        error.message.includes('Failed to fetch');

      if (attempt > maxRetries || !isRetryable || signal?.aborted) {
        throw error;
      }

      const isRateLimit = error.message.includes('429') || error.message.includes('Too Many Requests');
      const multiplier = isRateLimit ? 3 : 2;
      const delay = (baseDelay * Math.pow(multiplier, attempt - 1)) + (Math.random() * (isRateLimit ? 1000 : 500));

      console.log(`[Backoff] Attempt ${attempt} failed: ${error.message}. Retrying in ${Math.round(delay)}ms...`);

      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delay);
        const onAbort = () => {
          clearTimeout(t);
          reject(new Error('Simulation Cancelled by user.'));
        };
        if (signal?.aborted) {
          onAbort();
        } else {
          signal?.addEventListener('abort', onAbort, { once: true });
        }
      });
    }
  }
}

// ==================================================================
// 5. LLM RATE LIMITER FACTORY — Per-User Isolation via AsyncLocalStorage
// ==================================================================

/**
 * Create a new universal rate limiter instance for a user/session.
 * Configurable via env: LLM_RPM, LLM_MAX_CONCURRENT, LLM_BURST
 */
export function createLLMRateLimiter(config = null) {
  const cfg = config || { rpm: 60, maxConcurrent: 3, burstAllowance: 5 };
  return new LLMRateLimiter(cfg);
}

/**
 * Wrap a callback with a per-user LLM context (limiter + uuid) in AsyncLocalStorage.
 * Must be used to wrap the entire automation execution flow (e.g., in automation_router.js).
 * @param {string} uuid - User/simulation unique identifier
 * @param {function} fn - The async function to execute within the context
 * @param {object} rateLimitConfig - Optional limiter config
 */
export async function withLLMContext(uuid, fn, rateLimitConfig = undefined) {
  if (typeof global === 'undefined') return fn();
  if (!global.memtraceLlmContext) {
    const { AsyncLocalStorage } = await import('node:async_hooks');
    global.memtraceLlmContext = new AsyncLocalStorage();
  }
  const limiter = createLLMRateLimiter(rateLimitConfig);
  return global.memtraceLlmContext.run({ uuid, limiter }, fn);
}

/**
 * Retrieve the current user's rate limiter from AsyncLocalStorage.
 * Returns undefined if called outside an initialized context.
 */
export function getLLMLimiter() {
  if (typeof global === 'undefined' || !global.memtraceLlmContext) return undefined;
  const store = global.memtraceLlmContext.getStore();
  return store?.limiter;
}

// ==================================================================
// 6. SHARED RATE LIMITER (Global Throttling)
//    Delegates to LLMRateLimiter (Token Bucket + Semaphore) when
//    a per-user context is active; otherwise falls back to simple
//    time-based throttling (legacy path).
// ==================================================================

/**
 * Throttle an LLM call. When an LLMRateLimiter is available from the
 * current AsyncLocalStorage context (see initLLMContext / getLLMLimiter),
 * delegates to the token-bucket + semaphore limiter.
 *
 * @param {string} [key='default'] — provider/user key (ignored when using LLMRateLimiter)
 * @returns {{ release: () => void, limiter: LLMRateLimiter | undefined }}
 *   Caller MUST invoke release() in a finally block. limiter is provided for
 *   onRateLimited() calls on 429 responses.
 */
export async function rateLimit(key = 'default') {
  // Read abort signal from the current ALS context so all waits can be interrupted
  let signal;
  if (typeof global !== 'undefined' && global.memtraceLlmContext) {
    const store = global.memtraceLlmContext.getStore();
    signal = store?.signal;
  }

  const limiter = getLLMLimiter();
  if (limiter) {
    await limiter.acquire(signal);
    return { release: () => limiter.release(), limiter };
  }

  const RATE_MS = 1200;

  let lastCalls;
  if (typeof global !== 'undefined' && global.memtraceRateLimitMap) {
    lastCalls = global.memtraceRateLimitMap;
  } else {
    lastCalls = new Map();
    if (typeof global !== 'undefined') global.memtraceRateLimitMap = lastCalls;
  }

  let uniqueKey = key;

  if (key !== 'localllm' && typeof global !== 'undefined' && global.memtraceLlmContext) {
    const store = global.memtraceLlmContext.getStore();
    if (store && store.uuid) {
      uniqueKey = `${key}_${store.uuid}`;
    }
  }

  const now = Date.now();
  const lastCall = lastCalls.get(uniqueKey) || 0;

  const delay = key === 'localllm' ? 50 : (key === 'xenova' ? 0 : RATE_MS);

  const allowedTime = Math.max(now, lastCall + delay);
  lastCalls.set(uniqueKey, allowedTime);

  const waitTime = allowedTime - now;
  if (waitTime > 0) {
    await _abortableSleep(waitTime, signal);
  }
  return { release: () => {}, limiter: undefined };
}

// Shared utility: sleep that throws immediately on abort signal
function _abortableSleep(ms, signal) {
  if (signal?.aborted) return Promise.reject(new Error('Simulation Cancelled by user.'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('Simulation Cancelled by user.'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
