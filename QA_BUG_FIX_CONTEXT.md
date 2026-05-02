# QA Bug Fix Context — Bug-Fix Branch
**Last updated:** 2026-05-02  
**Branch:** Bug-Fix

This file tracks every QA-identified bug fix applied to this branch. Each entry records: what was broken, what was changed, and what files were touched.

---

## MED-03 · listUsers has no pagination and excludes providers ✅
**File:** `backend/src/controllers/userController.js`

**Before:**
- `listUsers()` had no pagination — it fetched all records at once.
- Hard-coded `.eq('role', 'customer')` silently excluded providers and admins from an admin-facing endpoint.

**Fix:**
- Added `page` / `limit` query params (default 20, capped at 50) with Supabase `.range()`.
- Replaced the hard-coded role filter with an optional `role` query param — when omitted, all users are returned.
- Response now includes `page`, `limit`, and `total` (exact count from Supabase).

---

## MED-04 · VITE_ key fallback in authMiddleware ✅
**File:** `backend/src/middleware/authMiddleware.js`

**Before:**
- `getAdminClient()` fell back to `process.env.VITE_SUPABASE_URL` and `process.env.VITE_SUPABASE_SERVICE_ROLE_KEY` if the non-VITE_ vars were missing.
- This is a security risk: VITE_-prefixed variables are bundled into the browser and visible to all users.

**Fix:**
- Removed all `VITE_`-prefixed fallbacks.
- Now throws a descriptive startup error if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing.
- Added a comment explaining why `VITE_` prefixes must never be used for backend secrets.

---

## MED-05 · No email notification on booking accept/reject/complete ⏪ REVERTED
**Status:** Reverted on 2026-05-02.  
`emailService.js` deleted, `resend` uninstalled, fire-and-forget blocks removed from `bookingController.js`.

**Original intent:**
- Add fire-and-forget Resend emails after `acceptBooking`, `rejectBooking`, and `completeBooking`.
- Reason for revert: to be re-implemented via a different approach (see future fix).

---

## MED-06 · createBooking doesn't validate service_id belongs to provider_id ✅
**File:** `backend/src/controllers/bookingController.js`

**Before:**
- The service was fetched only for its `base_price`. No ownership check was performed — a customer could pass any `service_id` regardless of which provider it belongs to.

**Fix:**
- Updated the service select to also fetch `provider_id`.
- Added a check: if `service.provider_id !== provider.id`, return `400` with `"Service does not belong to the specified provider"`.
- Also updated the provider select to include `id` (previously only `verification_status, user_id`).

---

## MED-07 · All controllers use console.error — no structured logger ✅
**Files:**  
- `backend/src/utils/logger.js` *(new)*  
- `backend/src/controllers/bookingController.js`  
- `backend/src/controllers/reviewController.js`  
- `backend/src/controllers/serviceController.js`  
- `backend/src/controllers/userController.js`  
- `backend/src/controllers/authController.js`

**Before:**
- All controllers used `console.error(err)` — no structure, no context, no environment-aware formatting.

**Fix:**
- Created `logger.js` exporting a configured `pino` instance:
  - Production: JSON output (`NODE_ENV === 'production'`).
  - Development: pretty-printed via `pino-pretty`.
- Replaced every `console.error(err)` call across all controllers with `logger.error({ err }, 'descriptive message')`.
- **Dependencies added:** `pino`, `pino-pretty` (npm).

---

## LOW-01 · Profile.tsx uses alert() instead of toast ✅
**File:** `frontend/src/pages/Profile.tsx`

**Before:**
- The "Become a Provider" role-upgrade handler used `window.alert()` and `alert()` for both success and error feedback.

**Fix:**
- Added a `notification` state (`{ message, type: 'success' | 'error' }`) following the same pattern used in `Login.tsx` and `Register.tsx`.
- Success/error messages are shown in a fixed top-right notification bar that auto-dismisses after 5 seconds.
- On successful role upgrade, the page reloads after a 1.5 s delay (giving the notification time to be read).
- No external library required — consistent with the existing in-app pattern.

---

## LOW-02 · BookingConfirmation.tsx has no auth guard ✅
**File:** `frontend/src/pages/BookingConfirmation.tsx`

**Before:**
- The component made an authenticated API call regardless of whether `token` was present, which would fail with a 401.

**Fix:**
- Added a `useEffect` auth guard that runs on mount: if `token` is empty/null/whitespace-only, `onNavigate('/login')` is called immediately.
- The data-fetching `useEffect` also guards on `!token?.trim()` so it never fires when the guard redirects.

---

## LOW-03 · register() doesn't normalize fullName ✅
**File:** `backend/src/controllers/authController.js`

**Before:**
- `fullName` was passed directly to the database with only a `.trim()` — internal extra spaces were preserved and no title-casing was applied.

**Fix:**
- `fullName` is now normalized before insertion:
  1. Leading/trailing whitespace trimmed.
  2. Internal runs of whitespace collapsed to a single space.
  3. Title-case applied (first letter of each word uppercased).
- Applied consistently to `user_metadata.full_name` before the Supabase `signUp()` call — same approach as email normalization already in the function.
