const secretsToSync = [
    'TURSO_DATABASE_URL',
    'TURSO_AUTH_TOKEN',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'LLM_PROVIDER',
    'LLM_MODEL',
    'EMB_PROVIDER',
    'API_KEY',
    'ADMIN_EMAILS'
];

async function syncSecrets() {
    const { HF_USERNAME, HF_SPACE_NAME, HF_TOKEN } = process.env;

    if (!HF_USERNAME || !HF_SPACE_NAME || !HF_TOKEN) {
        console.error("❌ Missing required HF credentials (HF_USERNAME, HF_SPACE_NAME, HF_TOKEN) in environment.");
        process.exit(1);
    }

    const repoId = `${HF_USERNAME}/${HF_SPACE_NAME}`;
    console.log(`🤖 Starting Hugging Face API Provisioning for Space: ${repoId}`);

    for (const key of secretsToSync) {
        const value = process.env[key];
        if (value && value.trim() !== '') {
            try {
                const response = await fetch(`https://huggingface.co/api/spaces/${repoId}/secrets`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${HF_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ key, value, description: "Auto-synced by Memtrace Deployer" })
                });

                if (response.ok) {
                    console.log(`  ✓ Synced secret: ${key}`);
                } else {
                    const errorText = await response.text();
                    console.error(`  ❌ Failed to sync secret ${key}: ${response.status} ${response.statusText}`);
                    console.error(`     Response: ${errorText}`);
                    process.exit(1);
                }
            } catch (error) {
                console.error(`  ❌ Network error while syncing secret ${key}:`, error.message);
                process.exit(1);
            }
        } else {
            console.log(`  ℹ️  Skipped ${key} (Empty or not defined in environment)`);
        }
    }
    
    console.log("✅ Hugging Face API Provisioning completed successfully.");
}

syncSecrets();
