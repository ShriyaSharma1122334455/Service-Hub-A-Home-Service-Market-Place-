/**
 * @fileoverview Authentication middleware for ServiceHub Express backend.
 *
 * Verifies Supabase user session tokens by calling supabase.auth.getUser(token)
 * on a cached admin client initialised with SUPABASE_SERVICE_ROLE_KEY.
 *
 * Why this over local JWKS verification:
 *  - Works for both the current ECC/ES256 tokens and the legacy HS256 tokens
 *    that may still be in active sessions during Supabase's migration window.
 *  - The sb_secret_* format service-role key is accepted by Supabase v2.95+.
 *  - One network call per request (sub-ms because Supabase auth is in the
 *    same region), but always returns up-to-date session validity (revoked
 *    tokens are caught immediately, unlike local JWT verification).
 *
 * Required .env:
 *   SUPABASE_URL              (e.g. https://xxx.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY (sb_secret_* or legacy eyJ... service role key)
 *
 * @module middleware/authMiddleware
 */

import { createClient } from '@supabase/supabase-js';

// ── Cached admin client ────────────────────────────────────────────────────
// Created lazily on first authenticate() call so that env vars are loaded.
// createClient is stateless for auth.getUser — persistSession: false ensures
// no session is stored between requests.

let _adminClient = null;

function getAdminClient() {
  if (!_adminClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env'
      );
    }
    _adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
  }
  return _adminClient;
}

// ── authenticate ──────────────────────────────────────────────────────────

/**
 * Express middleware that authenticates requests via Supabase JWT.
 *
 * Calls supabase.auth.getUser(token) on the admin client.
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
    const adminClient = getAdminClient();
    const { data, error } = await adminClient.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or expired token.',
      });
    }

    req.user = {
      id:         data.user.id,
      email:      data.user.email,
      role:       data.user.user_metadata?.role
                  || data.user.app_metadata?.role
                  || 'customer',
      supabaseId: data.user.id,
    };

    return next();
  } catch (_err) {
    // getUser() threw unexpectedly (network failure, config error, etc.).
    // This is a server-side problem — return 500, not 401.
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred during authentication.',
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
    const adminClient = getAdminClient();
    const { data, error } = await adminClient.auth.getUser(token);

    if (!error && data?.user) {
      req.user = {
        id:         data.user.id,
        email:      data.user.email,
        role:       data.user.user_metadata?.role
                    || data.user.app_metadata?.role
                    || 'customer',
        supabaseId: data.user.id,
      };
    }
    // Intentionally silent on error — optional auth never blocks a request
  } catch (_err) {
    // Intentionally silent
  }

  return next();
};

// ── test helpers ──────────────────────────────────────────────────────────
// Allow tests to inject a mock Supabase client without real network calls.
// Call setSupabaseClient(mock) in beforeAll/beforeEach, resetSupabaseClient()
// in afterAll/afterEach.

/**
 * Injects a mock Supabase client. Used by unit tests to avoid real network calls.
 * @param {object} client - Object with { auth: { getUser: jest.fn() } }
 */
export const setSupabaseClient = (client) => { _adminClient = client; };

/**
 * Resets the cached admin client so the real createClient() is used again.
 */
export const resetSupabaseClient = () => { _adminClient = null; };

export default {
  authenticate,
  requireRole,
  optionalAuthenticate,
  setSupabaseClient,
  resetSupabaseClient,
};
