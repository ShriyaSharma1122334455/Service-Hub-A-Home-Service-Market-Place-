import { createClient } from '@supabase/supabase-js';

// ── Cached admin client ───────────────────────────────────────────────────
let _adminClient = null;

function getAdminClient() {
  if (!_adminClient) {
    // A-10: VITE_ fallbacks removed — backend secrets must never use that prefix.
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the backend .env file. ' +
        'Do NOT use VITE_ prefixed keys on the server — those are bundled into the frontend build.',
      );
    }

    _adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
  }
  return _adminClient;
}

// ── authenticate ──────────────────────────────────────────────────────────

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error:   'Unauthorized',
      message: 'Missing or malformed Authorization header. Expected: Bearer <token>',
    });
  }

  const token = authHeader.split(' ')[1];
  if (!token?.trim()) {
    return res.status(401).json({
      success: false,
      error:   'Unauthorized',
      message: 'Token is empty.',
    });
  }

  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        success: false,
        error:   'Unauthorized',
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
    return res.status(500).json({
      success: false,
      error:   'Internal Server Error',
      message: 'An unexpected error occurred during authentication.',
    });
  }
};

// ── requireRole ───────────────────────────────────────────────────────────

export const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error:   'Unauthorized',
      message: 'authenticate() must run before requireRole().',
    });
  }

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error:   'Forbidden',
      message: `Required role(s): ${allowedRoles.join(', ')}. Your role: ${req.user.role}.`,
    });
  }

  return next();
};

// ── optionalAuthenticate ──────────────────────────────────────────────────

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
  } catch (_err) {
    // Intentionally silent — optional auth never blocks a request
  }

  return next();
};

// ── Test injection helpers ────────────────────────────────────────────────

/** Injects a mock Supabase client. For use in Jest tests only. */
export const setSupabaseClient   = (client) => { _adminClient = client; };

/** Resets to the real Supabase client. For use in Jest tests only. */
export const resetSupabaseClient = () => { _adminClient = null; };

export default {
  authenticate,
  requireRole,
  optionalAuthenticate,
  setSupabaseClient,
  resetSupabaseClient,
};