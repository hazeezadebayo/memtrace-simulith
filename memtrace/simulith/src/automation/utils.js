import http from 'http';

export function isCancellationError(e, signal) {
  if (signal?.aborted) return true;
  if (!e) return false;
  const name = e.name || '';
  const msg = e.message || String(e);
  return (
    name === 'AbortError' ||
    msg === 'Simulation Cancelled by user.' ||
    msg.includes('Simulation Cancelled by user.') ||
    msg.includes('aborted') ||
    msg.includes('AbortError') ||
    msg.includes('CANCELLED')
  );
}

export const globalAutomationStatus = new Map();
export const globalAutomationLogs = new Map();

export function setAutomationState(uuid, stateStr) {
  if (!uuid) return;
  globalAutomationStatus.set(uuid, stateStr);
}

export function getAutomationState(uuid) {
  if (!uuid) return null;
  return globalAutomationStatus.get(uuid) || null;
}

export function logAutomation(uuid, stage, message, details = {}) {
  if (!uuid) return;
  if (!globalAutomationLogs.has(uuid)) {
    globalAutomationLogs.set(uuid, []);
  }
  globalAutomationLogs.get(uuid).push({
    stage,
    message,
    details,
    at: new Date().toISOString()
  });
}

export function clearAutomationLogs(uuid) {
  if (!uuid) return;
  globalAutomationLogs.delete(uuid);
}

export function getAutomationLogs(uuid) {
  if (!uuid) return [];
  return globalAutomationLogs.get(uuid) || [];
}

export async function pollJob(pollUrl, token, uuid, signal) {
  let printedCount = 0;
  try {
    while (true) {
      if (signal?.aborted) {
        throw new Error('Simulation Cancelled by user.');
      }

      const res = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal
      });
      if (!res.ok) {
        throw new Error((await res.json()).error || 'Failed to poll job status');
      }
      const job = await res.json();
      
      if (job.status === 'completed' || job.status === 'done') {
        return job.result;
      }
      if (job.status === 'error' || job.status === 'failed') {
        throw new Error(job.error || 'Job failed');
      }
      if (job.status === 'cancelled') {
        throw new Error('Simulation Cancelled by user.');
      }

      // Read logs and stream them to automation logs
      if (job.logs && job.logs.length > printedCount) {
        for (let i = printedCount; i < job.logs.length; i++) {
          const log = job.logs[i];
          logAutomation(uuid, log.stage || 'simulation', log.message, log.details);
        }
        printedCount = job.logs.length;
      }

      // Wait 1000ms before polling again
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 1000);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error('Simulation Cancelled by user.'));
        };
        if (signal?.aborted) {
          onAbort();
        } else {
          signal?.addEventListener('abort', onAbort, { once: true });
        }
      });
    }
  } catch (error) {
    if (isCancellationError(error, signal)) {
      console.log(`[Automation Utils] Polling aborted/cancelled for ${pollUrl}. Sending DELETE request...`);
      try {
        const urlObj = new URL(pollUrl);
        await fetch(pollUrl, {
          method: 'DELETE',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Origin': urlObj.origin
          }
        });
      } catch (e) {
        console.error('[Automation Utils] Failed to send DELETE cancellation request:', e.message);
      }
      throw new Error('Simulation Cancelled by user.');
    }
    throw error;
  }
}

export async function runCouncil(baseUrl, token, payload, signal) {
  const res = await fetch(`${baseUrl}/api/v4/simulate/council`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'Authorization': `Bearer ${token}`,
      'Origin': baseUrl
    },
    body: JSON.stringify(payload),
    signal
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to start Council');
  const { pollUrl } = await res.json();
  return await pollJob(`${baseUrl}${pollUrl}`, token, payload.uuid, signal);
}

export async function runMesh(baseUrl, token, payload, signal) {
  const res = await fetch(`${baseUrl}/api/v4/simulate/mesh`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'Authorization': `Bearer ${token}`,
      'Origin': baseUrl
    },
    body: JSON.stringify(payload),
    signal
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to start Mesh');
  const { pollUrl } = await res.json();
  return await pollJob(`${baseUrl}${pollUrl}`, token, payload.uuid, signal);
}

export async function runTree(baseUrl, token, payload, signal) {
  const uuid = payload.uuid;
  let done = false;

  const pollProgress = async () => {
    let lastNodes = 0;
    while (!done) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (done) break;
      try {
        const res = await fetch(`${baseUrl}/api/v4/simulate/tree/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.nodesComputed > lastNodes) {
            logAutomation(uuid, 'tree', `Causal tree generation: ${data.nodesComputed} nodes computed.`);
            lastNodes = data.nodesComputed;
          }
        }
      } catch (e) {
        // ignore errors
      }
    }
  };

  pollProgress();

  try {
    const res = await new Promise((resolve, reject) => {
      const url = new URL(`${baseUrl}/api/v4/simulate/tree`);
      const req = http.request(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}`,
          'Origin': baseUrl
        },
        timeout: 3600000 // 1 hour
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) reject(new Error(parsed.error || 'Failed to run Tree'));
            else resolve(parsed);
          } catch(e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Tree simulation timed out after 1 hour.'));
      });
      if (signal) {
        const onAbort = () => {
          req.destroy();
          // Send explicit server-side cancellation for Tree Mode
          fetch(`${baseUrl}/api/v4/simulate/tree/cancel`, {
            method: 'DELETE',
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Origin': baseUrl
            }
          }).catch(err => console.error('[Automation Utils] Failed to send tree DELETE cancellation:', err));
          reject(new Error('Simulation Cancelled by user.'));
        };

        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }
      req.write(JSON.stringify({ ...payload, decision: payload.question }));
      req.end();
    });
    return res;
  } finally {
    done = true;
  }
}

