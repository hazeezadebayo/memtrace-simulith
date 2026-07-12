import { callLLM } from '../llm/ai.js';
import { getEmbedding, summarizeChunk, generateTags } from '../../../extension/core/llm_agent.js';
import { DEFAULT_CONFIG } from '../../../extension/env/config.js';

export const OrchestratorLLMAdapter = {
    provider: DEFAULT_CONFIG.llm_provider,
    emb_provider: DEFAULT_CONFIG.emb_provider,
    apiKey: DEFAULT_CONFIG.apiKey,

    async call(prompt, maxTokens = 200) {
        // Pass model=null to use default
        return await callLLM(prompt);
    },
    async embed(text) {
        return await getEmbedding(text, this.emb_provider, this.apiKey);
    },
    async summarize(text) {
        return await summarizeChunk(text, 100, this.provider, this.apiKey);
    },
    async tag(text) {
        return await generateTags(text, this.provider, this.apiKey);
    },
    async getConfig() {
        return { llm_provider: this.provider, emb_provider: this.emb_provider, apiKey: this.apiKey };
    },
    async validate() { return true; }
};
