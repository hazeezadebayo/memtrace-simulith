// Integrated LLM Provisions for Council V7
import { callLLM as unifiedCallLLM } from '../../../extension/core/llm_agent.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';

export async function callLLM(prompt, temperature = undefined, provider = null, apiKey = null, model = null) {
  const finalProvider = provider || DEFAULT_CONFIG.llm_provider;
  const finalApiKey = apiKey || DEFAULT_CONFIG.apiKey;
  const finalModel = model || DEFAULT_CONFIG.llm_model;
  try {
    // Delegate to unified factory
    console.log(`[AI] Requesting completion from ${finalProvider} (${finalModel}) using key ${finalApiKey ? finalApiKey.substring(0, 8) : 'null'}...`);
    const result = await unifiedCallLLM(finalProvider, finalApiKey, prompt, finalModel, temperature);
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
