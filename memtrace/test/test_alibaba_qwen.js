// test_alibaba_qwen.js
// A lightweight validation script to test Qwen LLM, Qwen Embeddings, and Alibaba Cloud Postgres.
// Run this via: node test_alibaba_qwen.js

import { callQwen } from '../extension/llm/qwen_llm_api_adapter.js';
import { getQwenEmbedding } from '../extension/llm/qwen_embedding_api_adapter.js';
import { AlibabaCloudAdapter } from '../extension/db/alibaba_cloud_rds_adapter.js';
import { DEFAULT_CONFIG } from '../extension/env/config.js';

async function runTests() {
    console.log("==================================================");
    console.log("🚀 STARTING QWEN & ALIBABA VALIDATION PING");
    console.log("==================================================");

    const apiKey = DEFAULT_CONFIG.apiKey;
    if (!apiKey || apiKey === 'xx-xx') {
        console.warn("⚠️  WARNING: apiKey is set to default 'xx-xx' in config.js");
        console.warn("⚠️  The Qwen API tests will likely fail unless your environment overrides it.");
    }

    // 1. Test Qwen LLM
    try {
        console.log("\n[1/3] Pinging Qwen LLM (qwen-turbo)...");
        const llmResponse = await callQwen(apiKey, "Ping. Reply exactly with the word 'Pong'.", 'qwen-turbo-latest', 0.1);
        console.log(`✅ Qwen LLM Response: "${llmResponse}"`);
    } catch (e) {
        console.error("❌ Qwen LLM Test Failed:", e.message);
    }

    // 2. Test Qwen Embedding
    let testVector = null;
    try {
        console.log("\n[2/3] Pinging Qwen Embedding (text-embedding-v4)...");
        testVector = await getQwenEmbedding("MemTrace Hackathon Validation", apiKey);
        console.log(`✅ Qwen Embedding Success! Array length: ${testVector.length}`);
    } catch (e) {
        console.error("❌ Qwen Embedding Test Failed:", e.message);
    }

    // 3. Test Alibaba Cloud ApsaraDB (CRUD)
    return; // i dont have the free coupon to test this.
    try {
        console.log("\n[3/3] Pinging Alibaba Cloud ApsaraDB Storage...");
        
        if (!DEFAULT_CONFIG.database_url) {
            throw new Error("No database_url provided in config.js. Set your ApsaraDB connection string.");
        }
        
        // Force the config for the test
        const testConfig = { ...DEFAULT_CONFIG, db_type: 'online', online_db_provider: 'alibaba' };

        const db = new AlibabaCloudAdapter(testConfig);
        await db.init(); // Connect & migrate

        const testId = "test_qwen_ping_123";
        const testUuid = "user_hackathon_999";
        
        // Mock a vector if the embedding test failed
        const mockVector = testVector || new Array(1536).fill(0.1); 

        // CREATE
        console.log("      -> Inserting test record...");
        await db.add({
            id: testId,
            uuid: testUuid,
            text: "Hackathon DB Validation String",
            embedding: mockVector,
            tags: ["test", "alibaba"],
            edge_list: [],
            url: "http://test"
        });

        // READ
        console.log("      -> Fetching test record...");
        const record = await db.get(testId, testUuid);
        if (!record || record.id !== testId) throw new Error("Record mismatch or not found.");

        // DELETE
        console.log("      -> Deleting test record...");
        await db.delete(testId, testUuid);
        
        const deletedRecord = await db.get(testId, testUuid);
        if (deletedRecord) throw new Error("Delete operation failed.");

        console.log("✅ Alibaba Cloud DB CRUD Success!");

        // Close pool to let script exit gracefully
        await db.pool.end(); 

    } catch (e) {
        console.error("❌ Alibaba Cloud DB Test Failed:", e.message);
    }

    console.log("\n==================================================");
    console.log("🏁 VALIDATION COMPLETE");
    console.log("==================================================");
}

// Execute
runTests().catch(console.error);
