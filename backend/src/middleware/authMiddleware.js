/**
 * @fileoverview Authentication middleware for ServiceHub Express backend.
 *
 * Validates Supabase JWT tokens on protected routes.
 * Uses LBYL for header checks, EAFP for token verification.
 * Supports dependency injection for testability (no jest.mock needed).
 *
 * SOLID Principles Applied:
 *  - SRP: Only handles auth concern.
 *  - OCP: New auth strategies addable without modifying this file.
 *  - LSP: All middleware functions follow Express (req, res, next) contract.
 *  - ISP: requireRole separated from authenticate.
 *  - DIP: Depends on injected client abstraction, not concrete Supabase instance.
 *
 * @module middleware/authMiddleware
 */

import { createClient } from '@supabase/supabase-js';

// ── Factory ───────────────────────────────────────────────────────────────

/**
 * @class SupabaseClientFactory
 * @description Factory for creating Supabase admin clients.
 */
class SupabaseClientFactory {
  /**
   * Creates a Supabase admin client from environment variables.
   * @returns {import('@supabase/supabase-js').SupabaseClient}
   * @throws {Error} If SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are missing.
   */
  static createAdminClient() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // LBYL: check env vars before attempting to create client
    if (!url || !serviceKey) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to your .env file.'
      );
    }

    return createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
}

// ── Singleton client (lazy, injectable for tests) ─────────────────────────

let _supabaseAdmin = null;

/**
 * Returns the shared Supabase admin client.
 * In tests, call setSupabaseClient(mockClient) before running tests.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
const getSupabaseAdmin = () => {
  if (!_supabaseAdmin) {
    _supabaseAdmin = SupabaseClientFactory.createAdminClient();
  }
  return _supabaseAdmin;
};

/**
 * Injects a custom Supabase client — used in tests to avoid real network calls.
 * Call this BEFORE importing/using authenticate in your test file.
 * @param {object} client - Any object with an `auth.getUser` method.
 */
export const setSupabaseClient = (client) => {
  _supabaseAdmin = client;
};

/**
 * Resets the injected client back to null so the real one is created on next use.
 * Call in afterEach/afterAll in tests.
 */
export const resetSupabaseClient = () => {
  _supabaseAdmin = null;
};

// ── authenticate ──────────────────────────────────────────────────────────

/**
 * Express middleware that authenticates requests via Supabase JWT.
 *
 * On success: attaches req.user = { id, email, role, supabaseId } and calls next().
 * On failure: responds 401 or 500.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 *
 * @example
 * router.get('/protected', authenticate, myController);
 */
export const authenticate = async (req, res, next) => {
  // LBYL: check header before any async work
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header. Expected: Bearer <token>',
    });
  }

  const token = authHeader.split(' ')[1];

  // LBYL: ensure token is not blank
  if (!token || token.trim() === '') {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Token is empty.',
    });
  }

  // EAFP: attempt verification, handle failure gracefully
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or expired token.',
      });
    }

    req.user = {
      id: data.user.id,
      email: data.user.email,
      role: data.user.user_metadata?.role || 'customer',
      supabaseId: data.user.id,
    };

    return next();
  } catch (err) {
    console.error('❌ Auth middleware error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Authentication service unavailable.',
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
    // LBYL: ensure authenticate ran first
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
 * Attaches user context if a valid token is present, but never blocks the request.
 * Silent failure — useful for public routes that show extra data when logged in.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const optionalAuthenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.auth.getUser(token);
    if (data?.user) {
      req.user = {
        id: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata?.role || 'customer',
        supabaseId: data.user.id,
      };
    }
  } catch (_) {
    // Intentionally silent
  }

  return next();
};

export default { authenticate, requireRole, optionalAuthenticate, setSupabaseClient, resetSupabaseClient };