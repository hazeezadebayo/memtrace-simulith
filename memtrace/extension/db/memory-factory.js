
import { createMemoryStore } from './abstraction.js';

export const StorageMode = {
    OFFLINE: 'offline',
    ONLINE: 'online'
};

export class MemoryFactory {
    static async init(mode, config) {
        console.log(`[MemoryFactory] Initializing ${mode} storage...`);

        if (mode === 'online') {
            const isNode = typeof window === 'undefined';

            if (!isNode) {
                console.log(`[MemoryFactory] Frontend detected. Using RemoteAdapter.`);
                const { RemoteAdapter } = await import('./remote-adapter.js');
                const db = new RemoteAdapter(config);
                await db.init();
                return db;
            }

            const provider = config.online_db_provider || 'alibaba';
            console.log(`[MemoryFactory] Backend online provider selected: ${provider}`);

            if (provider === 'alibaba') {
                const { AlibabaCloudAdapter } = await import('./alibaba_cloud_rds_adapter.js');
                const db = new AlibabaCloudAdapter(config);
                await db.init();
                return db;
            }
            if (provider === 'postgres') {
                return createMemoryStore('postgres', config);
            }
            if (provider === 'turso') {
                return createMemoryStore('sqlite', config);
            }
            throw new Error(`Unknown online DB provider: ${provider}`);
        }

        // Default strictly to offline sqlite
        return createMemoryStore('sqlite', config);
    }
}
