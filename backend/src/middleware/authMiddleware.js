/**
 * @fileoverview Authentication middleware for ServiceHub Express backend.
 *
 * Verifies Supabase user session tokens using JWKS (JSON Web Key Set).
 *
 * How it works:
 *  Supabase publishes its public signing keys at:
 *    <SUPABASE_URL>/.well-known/jwks.json
 *  This endpoint is public — no API key or secret needed.
 *  We fetch the keys once (lazily on first request) and cache them.
 *  jose's createRemoteJWKSet automatically re-fetches when Supabase
 *  rotates keys, so key rotation is handled transparently.
 *
 * Why JWKS over supabase.auth.getUser():
 *  - Supabase has migrated from legacy JWT-based API keys (eyJ...) to
 *    new opaque API keys (sb_secret_*, sb_publishable_*). The old
 *    supabase.auth.getUser() approach required a JWT-format service role
 *    key as the apikey header — which the new key format breaks.
 *  - JWKS verification is fully local after the first fetch, requires
 *    zero secrets in .env, and works with both the current ECC (P-256)
 *    signing key and the legacy HS256 key (still used for unexpired tokens).
 *
 * Required .env:  SUPABASE_URL   (already present — no new secrets needed)
 *
 * @module middleware/authMiddleware
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

// ── JWKS cache ────────────────────────────────────────────────────────────
// Lazily created on first authenticate() call so that SUPABASE_URL is
// guaranteed to be loaded from .env by the time we read it.
// createRemoteJWKSet caches the keys in memory and only re-fetches when
// it encounters a key ID it hasn't seen before (i.e. after a rotation).

let _jwks = null;

function getJWKS() {
  if (!_jwks) {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is not set in .env');
    }
    // Supabase's JWKS endpoint lives under /auth/v1/ not at the root
    _jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
    );
  }
  return _jwks;
}

// ── authenticate ──────────────────────────────────────────────────────────

/**
 * Express middleware that authenticates requests via Supabase JWT.
 *
 * Verifies the token against Supabase's public JWKS endpoint.
 * On success: attaches req.user = { id, email, role, supabaseId } → next()
 * On failure: responds 401.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 *
 * @example
 * router.get('/protected', authenticate, myController);
 */
export const authenticate = async (req, res, next) => {
  // Check header is present and well-formed
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header. Expected: Bearer <token>',
    });
  }

  const token = authHeader.split(' ')[1];
  if (!token?.trim()) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Token is empty.',
    });
  }

  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      // Validates that the token was issued by this Supabase project
      issuer:   `${process.env.SUPABASE_URL}/auth/v1`,
      // Only accept tokens for authenticated users (not the anon/service role keys)
      audience: 'authenticated',
    });

    req.user = {
      id:         payload.sub,
      email:      payload.email,
      role:       payload.user_metadata?.role
                  || payload.app_metadata?.role
                  || 'customer',
      supabaseId: payload.sub,
    };

    return next();
  } catch (_err) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or expired token.',
    });
  }
};

// ── requireRole ───────────────────────────────────────────────────────────

/**
 * Middleware factory for role-based access control.
 * Must run AFTER authenticate (which populates req.user).
 *
 * @param {...string} allowedRoles - Roles permitted to access the route.
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.post('/services', authenticate, requireRole('provider'), createService);
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'authenticate() must run before requireRole().',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Required role(s): ${allowedRoles.join(', ')}. Your role: ${req.user.role}.`,
      });
    }

    return next();
  };
};

// ── optionalAuthenticate ──────────────────────────────────────────────────

/**
 * Attaches user context if a valid token is present, but never blocks.
 * Useful for public routes that show extra data when logged in.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const optionalAuthenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  const token = authHeader.split(' ')[1];
  if (!token?.trim()) return next();

  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer:   `${process.env.SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });

    req.user = {
      id:         payload.sub,
      email:      payload.email,
      role:       payload.user_metadata?.role
                  || payload.app_metadata?.role
                  || 'customer',
      supabaseId: payload.sub,
    };
  } catch (_err) {
    // Intentionally silent — optional auth never blocks a request
  }

  return next();
};

// ── test helpers (no-ops) ─────────────────────────────────────────────────

/**
 * @deprecated JWKS verification has no client to inject.
 * Kept as a no-op for backward compatibility with existing tests.
 */
export const setSupabaseClient = (_client) => {};

/**
 * @deprecated No longer needed.
 * Kept as a no-op for backward compatibility with existing tests.
 */
export const resetSupabaseClient = () => {};

export default {
  authenticate,
  requireRole,
  optionalAuthenticate,
  setSupabaseClient,
  resetSupabaseClient,
};
