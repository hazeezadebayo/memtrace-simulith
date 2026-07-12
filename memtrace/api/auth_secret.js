import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Autonomous JWT Secret Management
 * Inspired by VoxSieve
 * 
 * If no explicit JWT_SECRET environment variable is provided, the system checks 
 * for a persisted .jwt_secret file in the data directory. If it doesn't exist,
 * it generates a 256-bit cryptographic key and saves it to survive restarts.
 */
export function loadOrCreateJwtSecret() {
    // 1. Explicit environment variable wins
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
        return process.env.JWT_SECRET;
    }

    // 2. Persisted file in the data volume
    // Resolve to the project's data directory so it survives Docker restarts
    const secretFile = path.resolve(__dirname, '../data/.jwt_secret');
    
    try {
        if (fs.existsSync(secretFile)) {
            const stored = fs.readFileSync(secretFile, 'utf8').trim();
            if (stored.length >= 32) {
                console.log("[Auth] JWT secret autonomously loaded from persisted file.");
                return stored;
            }
        }
    } catch (e) {
        console.warn(`[Auth] Could not read JWT secret file: ${e.message}`);
    }

    // 3. Generate a new cryptographically strong secret and persist it
    const newSecret = crypto.randomBytes(32).toString('hex'); // 256-bit secret (64 characters)
    try {
        const dir = path.dirname(secretFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(secretFile, newSecret, 'utf8');
        console.log("[Auth] New JWT secret autonomously generated and persisted.");
    } catch (e) {
        console.warn(`[Auth] Could not persist JWT secret (will regenerate on next restart): ${e.message}`);
    }

    return newSecret;
}
