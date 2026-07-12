import express from 'express';
import jwt from 'jsonwebtoken';
import { getOrCreateUser } from './db_users.js';
import { DEFAULT_CONFIG } from '../extension/env/config.js';
import { loadOrCreateJwtSecret } from './auth_secret.js';
import { OAuth2Client } from 'google-auth-library';

const JWT_SECRET = loadOrCreateJwtSecret();
const googleClient = new OAuth2Client(DEFAULT_CONFIG.google_client_id);

export function authenticate(req, res, next) {
    let token = req.cookies?.auth_token;
    if (!token && req.headers.authorization) {
        const match = req.headers.authorization.match(/^Bearer\s+(\S+)$/);
        if (match) {
            token = match[1];
        }
    }

    if (!token) {
        console.error('[Auth] Unauthorized: Missing token. Cookies:', req.cookies, 'Auth Header:', req.headers.authorization);
        return res.status(401).json({ error: 'Unauthorized: Missing session cookie or bearer token' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; 
        
        if (typeof global !== 'undefined' && global.memtraceLlmContext) {
            global.memtraceLlmContext.run({ uuid: decoded.uuid, onTokenUsed: null }, () => {
                next();
            });
        } else {
            next();
        }
    } catch (err) {
        console.error('[Auth] JWT Verification failed:', err.message, 'Token:', token);
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
    }
}

export function enforceOrigin(req, res, next) {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const origin = req.headers.origin || req.headers.referer;
        if (!origin) {
            return res.status(403).json({ error: 'Forbidden: Missing Origin or Referer header' });
        }
        
        try {
            const originUrl = new URL(origin);
            if (originUrl.host !== req.headers.host && originUrl.hostname !== 'localhost') {
                return res.status(403).json({ error: 'Forbidden: Invalid Origin' });
            }
        } catch (e) {
            return res.status(403).json({ error: 'Forbidden: Malformed Origin' });
        }
    }
    next();
}

const router = express.Router();

router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Missing token' });
    }

    if (!DEFAULT_CONFIG.google_client_id) {
        return res.status(500).json({ error: 'Google Client ID not configured on server.' });
    }

    const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: DEFAULT_CONFIG.google_client_id,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
        return res.status(401).json({ error: 'Invalid Google Token payload' });
    }

    const googleProfile = {
        id: payload.sub,
        email: payload.email
    };

    const user = await getOrCreateUser(googleProfile);

    const sessionToken = jwt.sign(
      { uuid: user.memtrace_uuid, email: user.email }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    res.cookie('auth_token', sessionToken, {
      httpOnly: true,
      secure: DEFAULT_CONFIG.node_env === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 
    });

    res.json({ success: true, email: user.email, token: sessionToken });
  } catch (error) {
    console.error('Auth Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ uuid: req.user.uuid, email: req.user.email });
});

router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

export default router;
