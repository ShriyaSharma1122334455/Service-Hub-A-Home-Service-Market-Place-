/**
 * @fileoverview Authentication middleware for ServiceHub Express backend.
 *
 * Validates Supabase JWT tokens LOCALLY using jsonwebtoken + SUPABASE_JWT_SECRET.
 * No Supabase API call is made on every request — verification is instant and
 * works without a service role key.
 *
 * How it works:
 *  Supabase signs every user session token with the project's JWT Secret
 *  (a plain HS256 string visible in Dashboard → Project Settings → API → JWT Secret).
 *  We verify the signature locally with jwt.verify(), then read the decoded payload
 *  to extract the user's id (sub), email, and role.
 *
 * SOLID Principles Applied:
 *  - SRP: Only handles auth concern.
 *  - OCP: New auth strategies addable without modifying this file.
 *  - LSP: All middleware functions follow Express (req, res, next) contract.
 *  - ISP: requireRole separated from authenticate.
 *
 * @module middleware/authMiddleware
 */

import jwt from 'jsonwebtoken';

// ── authenticate ──────────────────────────────────────────────────────────

/**
 * Express middleware that authenticates requests via Supabase JWT.
 *
 * Verifies the token LOCALLY using SUPABASE_JWT_SECRET (no API call).
 * On success: attaches req.user = { id, email, role, supabaseId } and calls next().
 * On failure: responds 401.
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
  // LBYL: check header before any work
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

  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    console.error('❌ SUPABASE_JWT_SECRET is not set in .env');
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Auth configuration error. Set SUPABASE_JWT_SECRET in .env.',
    });
  }

  // EAFP: verify locally — no network call needed
  try {
    const payload = jwt.verify(token, jwtSecret);

    req.user = {
      id:         payload.sub,
      email:      payload.email,
      role:       payload.user_metadata?.role || payload.app_metadata?.role || 'customer',
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
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;

  if (!token || !jwtSecret) return next();

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = {
      id:         payload.sub,
      email:      payload.email,
      role:       payload.user_metadata?.role || payload.app_metadata?.role || 'customer',
      supabaseId: payload.sub,
    };
  } catch (_err) {
    // Intentionally silent — optional auth never blocks
  }

  return next();
};

// ── test helpers ──────────────────────────────────────────────────────────

/**
 * @deprecated No longer needed — kept for backward compatibility with existing tests.
 * Local JWT verification has no admin client to inject.
 */
export const setSupabaseClient = (_client) => {};

/**
 * @deprecated No longer needed — kept for backward compatibility with existing tests.
 */
export const resetSupabaseClient = () => {};

export default { authenticate, requireRole, optionalAuthenticate, setSupabaseClient, resetSupabaseClient };
