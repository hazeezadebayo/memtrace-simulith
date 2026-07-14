// Integrated LLM Provisions for Council V7
import { callLLM as unifiedCallLLM } from '../../../extension/core/llm_agent.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';

export async function callLLM(prompt, temperature = undefined, provider = null, apiKey = null, model = null, systemMsg = undefined) {
  const finalProvider = provider || DEFAULT_CONFIG.llm_provider;
  const finalApiKey = apiKey || DEFAULT_CONFIG.apiKey;
  const finalModel = model || DEFAULT_CONFIG.llm_model;
  try {
    // Delegate to unified factory
    console.log(`[AI] Requesting completion from ${finalProvider} (${finalModel}) using key ${finalApiKey ? finalApiKey.substring(0, 8) : 'null'}...`);
    const result = await unifiedCallLLM(finalProvider, finalApiKey, prompt, finalModel, temperature, systemMsg);
    console.log(`[AI] ${finalProvider} RAW RESPONSE:\n----------\n${result ? result : 'EMPTY RESPONSE'}\n----------`);
    return result || null;
  } catch (error) {
    if (error.name === 'AbortError' || error.message === 'Simulation Cancelled by user.') {
      throw error;
    }
    console.error(`[AI] ${finalProvider} Provision Error:`, error.message, error.stack || error);
    return null;
  }
}

export const REPORT_SYSTEM_PROMPT = "You summarize simulation outputs into clear, accurate reports.";

export async function callLLMWithSystem(systemPrompt, userPrompt, temperature = undefined, provider = null, apiKey = null, model = null) {
  return callLLM(userPrompt, temperature, provider, apiKey, model, systemPrompt);
}

export function parseJson(text) {
  if (!text) return null;
  try {
    console.log(`[AI] Attempting to parse JSON from text: ${text.substring(0, 100).replace(/\n/g, ' ')}...`);
    const trimmed = text.trim();
    
    // 1. Try direct parse
    try {
      const parsed = JSON.parse(trimmed);
      console.log(`[AI] Successfully parsed JSON:`, JSON.stringify(parsed).substring(0, 100));
      return parsed;
    } catch (e) {}

    // 2. Try markdown code block
    const markdownMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
    if (markdownMatch) {
      try {
        const parsed = JSON.parse(markdownMatch[1].trim());
        console.log(`[AI] Successfully parsed JSON:`, JSON.stringify(parsed).substring(0, 100));
        return parsed;
      } catch (e) {}
    }

    // 3. Find first curly and square bracket
    const firstCurly = trimmed.indexOf('{');
    const firstSquare = trimmed.indexOf('[');

    if (firstCurly !== -1 && (firstSquare === -1 || firstCurly < firstSquare)) {
      const lastCurly = trimmed.lastIndexOf('}');
      if (lastCurly !== -1 && lastCurly > firstCurly) {
        try {
          const parsed = JSON.parse(trimmed.substring(firstCurly, lastCurly + 1));
          console.log(`[AI] Successfully parsed JSON:`, JSON.stringify(parsed).substring(0, 100));
          return parsed;
        } catch (e) {}
      }
    } else if (firstSquare !== -1) {
      const lastSquare = trimmed.lastIndexOf(']');
      if (lastSquare !== -1 && lastSquare > firstSquare) {
        try {
          const parsed = JSON.parse(trimmed.substring(firstSquare, lastSquare + 1));
          console.log(`[AI] Successfully parsed JSON:`, JSON.stringify(parsed).substring(0, 100));
          return parsed;
        } catch (e) {}
      }
    }

    // 4. Match fallback
    const match = trimmed.match(/\[[\s\S]*\]/) || trimmed.match(/{[\s\S]*}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      console.log(`[AI] Successfully parsed JSON:`, JSON.stringify(parsed).substring(0, 100));
      return parsed;
    }
    
    throw new Error('No valid JSON object or array found in text');
  } catch (e) {
    console.error(`[AI] parseJson error: ${e.message}. Raw text was:\n${text}`);
    return null;
  }
}

/* -----------------------------------------------------------------
   Tool-Calling LLM
   Wraps callLLM with tool support. Works with any provider —
   tool schemas are embedded in the prompt as text, tool calls
   are parsed from the response.
   ----------------------------------------------------------------- */
const TOOL_CALL_RE = /\[TOOL_CALL:\s*(\w+)\s*(\{(?:[^{}]|(\{[^{}]*\}))*\}|)\]/g;

function findToolCalls(text) {
  const calls = [];
  let match;
  TOOL_CALL_RE.lastIndex = 0;
  while ((match = TOOL_CALL_RE.exec(text)) !== null) {
    const name = match[1];
    let args = {};
    if (match[2]) {
      try { args = JSON.parse(match[2]); } catch {}
    }
    calls.push({ name, args });
  }
  return calls;
}

function buildToolPrompt(userPrompt, toolManifest) {
  return `${userPrompt}

[TOOL MANIFEST]
You have access to the following tools. Use them when you need external information or reasoning capabilities.

${toolManifest}

To call a tool, include this exact syntax in your response:
[TOOL_CALL: tool_name {"arg1": "value1", "arg2": "value2"}]

You can call multiple tools in sequence. After each tool call, the result will be provided.
Do not call a tool if you can answer from your own knowledge.
Do not fabricate tool results. Only call a tool when you genuinely need it.`;
}

export async function callLLMWithTools(prompt, tools, options = {}) {
  if (!tools || !tools.hasTools()) {
    return callLLM(prompt, options.temperature, options.provider, options.apiKey, options.model);
  }

  const maxIterations = options.maxIterations || 5;
  const toolManifest = tools.getManifest();
  const conversation = [
    { role: 'user', content: buildToolPrompt(prompt, toolManifest) }
  ];

  for (let iter = 0; iter < maxIterations; iter++) {
    const fullPrompt = conversation.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n---\n\n');
    const raw = await callLLM(fullPrompt, options.temperature, options.provider, options.apiKey, options.model);

    if (!raw) return null;

    const toolCalls = findToolCalls(raw);

    if (toolCalls.length === 0) {
      return raw;
    }

    for (const tc of toolCalls) {
      conversation.push({ role: 'assistant', content: raw });
      try {
        const result = await tools.callTool(tc.name, tc.args);
        conversation.push({
          role: 'system',
          content: `[TOOL_RESULT: ${tc.name}] ${JSON.stringify(result)}`
        });
      } catch (err) {
        conversation.push({
          role: 'system',
          content: `[TOOL_ERROR: ${tc.name}] ${err.message}`
        });
      }
    }
  }

  return '[TOOL_LIMIT] Tool call limit reached. Final response:\n' + (conversation[conversation.length - 1]?.content || '');
}
