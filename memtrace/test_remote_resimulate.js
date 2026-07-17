import jwt from 'jsonwebtoken';

const REMOTE_URL = 'http://47.82.157.35:3000';
const JWT_SECRET = 'c0a50b29d006f53ada743c8e1195bba9564e4cc48b3117fc0ce46a885bb3e0a2';
const USER_UUID = 'fb40f28c-f073-4fe2-904f-27b8e8073ced';

// Sign token
const token = jwt.sign({ uuid: USER_UUID, email: 'remote-test@example.com' }, JWT_SECRET, { expiresIn: '1h' });
const authHeaders = {
  'Cookie': `auth_token=${token}`,
  'Origin': 'http://localhost:3000',
  'Content-Type': 'application/json'
};

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function pollJob(jobId) {
  console.log(`Polling job ${jobId}...`);
  while (true) {
    const res = await fetch(`${REMOTE_URL}/api/v4/jobs/${jobId}`, { headers: authHeaders });
    const job = await res.json();
    if (job.status === 'done') {
      console.log(`Job ${jobId} complete!`);
      return job.result;
    }
    if (job.status === 'error') {
      throw new Error(`Job failed: ${JSON.stringify(job.error)}`);
    }
    await delay(1000);
  }
}

async function run() {
  try {
    console.log('1. Starting simulation...');
    const simRes = await fetch(`${REMOTE_URL}/api/v4/simulate/council`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        question: 'Should we launch the product now or wait?',
        facts: ['Competition is low.', 'Prototype is ready.'],
        branchCount: 3,
        personaCount: 2
      })
    });
    
    if (!simRes.ok) {
      const err = await simRes.json();
      throw new Error(`Simulation request failed: ${JSON.stringify(err)}`);
    }
    
    const { jobId } = await simRes.json();
    const simResult = await pollJob(jobId);
    
    const runId = simResult.id || simResult.runId;
    console.log(`Simulation complete. Run ID: ${runId}`);
    console.log('Branches in result:', simResult.branches.map(b => b.id));

    console.log('\n2. Triggering FIRST resimulation on gen-branch-1...');
    const resim1 = await fetch(`${REMOTE_URL}/api/v4/runs/${runId}/branches/gen-branch-1/resimulate`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ newEvidence: 'We must launch because of competition.' })
    });
    
    if (!resim1.ok) {
      const err = await resim1.json();
      throw new Error(`First resimulation request failed: ${JSON.stringify(err)}`);
    }
    
    const job1 = await resim1.json();
    const result1 = await pollJob(job1.jobId);
    console.log(`First resimulation complete. Branches count: ${result1.allBranches?.length}`);
    console.log(`First resimulation allBranches:`, result1.allBranches?.map(b => b ? b.id : 'null/undefined'));

    console.log('\n3. Triggering SECOND resimulation on gen-branch-2...');
    const resim2 = await fetch(`${REMOTE_URL}/api/v4/runs/${runId}/branches/gen-branch-2/resimulate`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ newEvidence: 'We must wait because of stability concerns.' })
    });
    
    if (!resim2.ok) {
      const err = await resim2.json();
      throw new Error(`Second resimulation request failed: ${JSON.stringify(err)}`);
    }
    
    const job2 = await resim2.json();
    const result2 = await pollJob(job2.jobId);
    console.log(`Second resimulation complete. Branches count: ${result2.allBranches?.length}`);
    console.log(`Second resimulation allBranches:`, result2.allBranches?.map(b => b ? b.id : 'null/undefined'));
    console.log('Result 2 recommendation:', JSON.stringify(result2.recommendation, null, 2));
    console.log('Result 2 counterfactuals:', JSON.stringify(result2.counterfactuals, null, 2));

  } catch (err) {
    console.error('Fatal Error:', err);
  }
}

run();
