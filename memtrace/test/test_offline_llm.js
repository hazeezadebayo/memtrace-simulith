import { checkInjectionGuardrail } from '../extension/core/llm_agent.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { deductToken, refundToken, getOrCreateUser } from '../api/db_users.js';

global.memtraceLlmContext = new AsyncLocalStorage();
global.deductMemtraceToken = deductToken;
global.refundMemtraceToken = refundToken;

try {
  // Get or create a mock user
  const user = await getOrCreateUser({ id: '1234567890_mock_google_id', email: 'mockuser@example.com' });
  console.log("Mock User:", user);

  await global.memtraceLlmContext.run({ uuid: user.memtrace_uuid, onTokenUsed: null }, async () => {
    console.log("Running guardrail check inside context...");
    const result = await checkInjectionGuardrail("labor relations adaptation");
    console.log("RESULT:", result);
  });
} catch (e) {
  console.error("ERROR:", e);
}
