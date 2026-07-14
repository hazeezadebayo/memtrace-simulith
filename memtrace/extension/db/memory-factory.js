
import { createMemoryStore } from './abstraction.js';

export const StorageMode = {
    OFFLINE: 'offline',
    ONLINE: 'online'
};

export class MemoryFactory {
    static async init(mode, config) {
        console.log(`[MemoryFactory] Initializing ${mode} storage...`);

        if (mode === 'online') {
            const provider = config.online_db_provider || 'alibaba';
            console.log(`[MemoryFactory] Online provider selected: ${provider}`);

            const isNode = typeof window === 'undefined';

            if (provider === 'alibaba' && isNode) {
                const { AlibabaCloudAdapter } = await import('./alibaba_cloud_rds_adapter.js');
                const db = new AlibabaCloudAdapter(config);
                await db.init();
                return db;
            }
            if (provider === 'turso') {
                const { RemoteAdapter } = await import('./remote-adapter.js');
                const db = new RemoteAdapter(config);
                await db.init();
                return db;
            }
            if (provider === 'postgres' && isNode) {
                return createMemoryStore('postgres', config);
            }
            throw new Error(`Unknown online DB provider: ${provider}`);
        }

        // Default strictly to offline sqlite
        return createMemoryStore('sqlite', config);
    }
}
