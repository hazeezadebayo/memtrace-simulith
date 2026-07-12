import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

export class JobQueue extends EventEmitter {
  constructor({ processJob, retries = 2, backoffMs = 250 } = {}) {
    super();
    if (typeof processJob !== 'function') {
      throw new Error('JobQueue requires a processJob function.');
    }
    this.processJob = processJob;
    this.retries = retries;
    this.backoffMs = backoffMs;
    this.jobs = new Map();
    this.activeSessions = new Set();
    this.pumping = false;
  }

  enqueue(payload) {
    const id = randomUUID();
    const abortController = new AbortController();
    const job = {
      id,
      payload,
      status: 'queued',
      attempts: 0,
      retriesLeft: this.retries,
      progress: 0,
      logs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nextAttemptAt: null,
      result: null,
      error: null,
      abortController,
      abortSignal: abortController.signal
    };
    this.jobs.set(id, job);
    this._pump();
    return job;
  }

  load(jobs = []) {
    for (const job of jobs) {
      if (job.status === 'running' || job.status === 'queued' || job.status === 'retry_wait') {
        job.status = 'error'; // Do not auto-resume old jobs; they block the queue
        job.error = 'Job aborted due to server restart.';
      }
      this.jobs.set(job.id, job);
    }
    this._pump();
  }

  get(id) {
    const job = this.jobs.get(id);
    if (job && (job.status === 'queued' || job.status === 'retry_wait')) {
      const userActiveJobs = this.list().filter(j => 
        (j.status === 'queued' || j.status === 'retry_wait') && 
        (j.payload?.uuid === job.payload?.uuid)
      );
      job.queuePosition = userActiveJobs.findIndex(j => j.id === id) + 1;
    } else if (job) {
      job.queuePosition = 0;
    }
    return job;
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') return false;
    
    job.status = 'cancelled';
    job.error = 'Cancelled by user';
    job.updatedAt = new Date().toISOString();
    // Abort any in-flight LLM fetch immediately
    if (job.abortController) job.abortController.abort();
    return true;
  }

  list() {
    return [...this.jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async _pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      const activeJobs = this.list().filter(job => job.status === 'queued' || job.status === 'retry_wait');
      for (const next of activeJobs) {
        if (next.status === 'retry_wait' && next.nextAttemptAt && Date.now() < new Date(next.nextAttemptAt).getTime()) {
          continue;
        }
        
        const sessionId = next.payload?.uuid || 'global';
        if (this.activeSessions.has(sessionId)) {
          continue; // User already has a job running, preserve sequential ordering for this tenant
        }
        
        this.activeSessions.add(sessionId);
        this._run(next, sessionId).catch(err => console.error('[Queue] Unhandled job execution error:', err));
      }
    } finally {
      this.pumping = false;
    }
  }

  async _run(job, sessionId = 'global') {
    job.status = 'running';
    job.attempts += 1;
    job.updatedAt = new Date().toISOString();
    const emit = (stage, message, details = {}) => {
      job.logs.push({ stage, message, details, at: new Date().toISOString() });
      job.progress = Math.min(99, job.progress + 8);
      job.updatedAt = new Date().toISOString();
    };
    emit('queue', `Attempt ${job.attempts} started.`);
    try {
      if (typeof global !== 'undefined' && global.memtraceLlmContext && job.payload?.uuid) {
        const storeContext = { 
          uuid: job.payload.uuid, 
          onTokenUsed: (amt) => { job.tokensUsed = (job.tokensUsed || 0) + amt; },
          signal: job.abortSignal
        };
        job.result = await new Promise((resolve, reject) => {
          global.memtraceLlmContext.run(storeContext, async () => {
            try { resolve(await this.processJob(job.payload, emit, job)); } 
            catch (err) { reject(err); }
          });
        });
      } else {
        job.result = await this.processJob(job.payload, emit, job);
      }
      job.status = 'done';
      job.progress = 100;
      emit('done', 'Simulation completed.');
      this.emit('jobCompleted', job.id);
    } catch (error) {
      if (
        error.name === 'AbortError' ||
        error.message === 'Simulation Cancelled by user.' ||
        error === 'CANCELLED' ||
        (error instanceof Error && error.message?.includes('Simulation Cancelled by user.')) ||
        (error instanceof Error && error.message?.includes('aborted'))
      ) {
        job.status = 'cancelled';
        job.error = 'Cancelled by user';
        emit('cancelled', 'Job was cancelled by the user.');
        this.emit('jobCancelled', job.id);
      } else {
        console.error('[Queue] Job execution failed:', error);
        job.error = error instanceof Error ? error.message : String(error);
        if (job.retriesLeft > 0) {
          job.retriesLeft -= 1;
          job.status = 'retry_wait';
          job.nextAttemptAt = new Date(Date.now() + this.backoffMs * (job.attempts + 1)).toISOString();
          emit('retry', `Retry scheduled because: ${job.error}`, { retriesLeft: job.retriesLeft });
        } else {
          job.status = 'error';
          emit('error', job.error);
          this.emit('jobFailed', job.id);
        }
      }
    } finally {
      job.updatedAt = new Date().toISOString();
      this.activeSessions.delete(sessionId);
      this._pump();
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
