/**
 * @fileoverview Profile routes for ServiceHub API.
 *
 * Demonstrates integration of auth middleware with existing routes.
 * ─────────────────────────────────────────────────────────────
 * BEFORE (Sprint 1 — no auth):
 *   router.get('/me', getMe);
 *   router.get('/users', listUsers);
 *
 * AFTER (Sprint 2 — secured):
 *   router.get('/me', authenticate, getMe);          ← requires any valid token
 *   router.get('/users', authenticate, listUsers);   ← same
 *
 * Public routes like /providers and /provider/:id remain open
 * because the project plan specifies the browse catalog is public.
 * ─────────────────────────────────────────────────────────────
 *
 * COMPATIBILITY: The existing controllers (userController, providerController)
 * are NOT changed. Auth middleware simply pre-validates the request.
 * req.user is now available inside controllers if needed.
 *
 * @module routes/profileRoutes
 */

import express from 'express';
import { getMe, getUser, listUsers } from '../controllers/userController.js';
import { getProvider, listProviders } from '../controllers/providerController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// ── Protected routes (require valid Supabase JWT) ──────────────────────────

/**
 * GET /api/profile/me
 * Returns the authenticated user's full profile (customer or provider).
 * Requires: Bearer token in Authorization header.
 */
router.get('/me', authenticate, getMe);

/**
 * GET /api/profile/user/:id
 * Returns a specific user's public profile.
 * Requires: any authenticated user.
 */
router.get('/user/:id', authenticate, getUser);

/**
 * GET /api/profile/users
 * Lists all customers. Could be admin-only in a future sprint.
 * Requires: any authenticated user.
 */
router.get('/users', authenticate, listUsers);

// ── Public routes (no auth required — browse catalog is public) ────────────

/**
 * GET /api/profile/providers
 * Lists all providers. Public so customers can browse without logging in.
 */
router.get('/providers', listProviders);

/**
 * GET /api/profile/provider/:id
 * Returns a specific provider's public profile.
 */
router.get('/provider/:id', getProvider);

export default router;
