# Verification Flow — Walkthrough & Findings

## Bug A — DOB not shown during verification

### Data flow (as observed)

1. User enters DOB at `frontend/src/pages/Register.tsx:222` via three `<select>` dropdowns (month/day/year); combined into `YYYY-MM-DD` string (lines 540, 558, 573); stored in state as `dob`.
2. Submit handler calls `onRegister()` at line 463, which builds the registration payload with key `dob` and POSTs to `POST /api/auth/register` (`frontend/src/App.tsx:331`).
3. Express handler at `backend/src/controllers/authController.js:11` destructures `dob` from `req.body`, validates 18+ age (lines 40-54), converts to ISO as `dobIso` (line 41).
4. Persisted in TWO places:
   - Supabase auth.users metadata: `data: { dob: dobIso }` (`authController.js:79`)
   - `public.users` table, column `dob`: `.update({ dob: dobIso })` (`authController.js:108`)
5. Verification screen (`frontend/src/pages/verify/index.tsx`) calls `GET /verification/prefill/${userId}` on mount (line 88).
6. Express prefill handler at `backend/src/controllers/verificationController.js:62` runs:
   ```js
   .select('full_name, email, phone')   // ← 'dob' MISSING
   ```
7. Response is built at `verificationController.js:77` with:
   ```js
   date_of_birth: null,   // ← HARDCODED TO null
   ```
8. Frontend destructures `dateOfBirth: res.data.date_of_birth || ""` (verify/index.tsx:95) and renders `value={prefill?.dateOfBirth || "Not provided"}` (line 394) — always shows "Not provided".

### Where it breaks

**`backend/src/controllers/verificationController.js` lines 62 and 77.**
The `getPrefill` controller selects only `full_name, email, phone` from `public.users`, omitting `dob`. The response then hardcodes `date_of_birth: null`. The DOB exists in the database (stored correctly during registration) but is never fetched or returned. The frontend has a working display path — it just always receives `null`.

### Proposed fix

- **`verificationController.js` line 62:** add `dob` to the SELECT → `.select('full_name, email, phone, dob')`
- **`verificationController.js` line 77:** map it in the response → `date_of_birth: user.dob || null`
- **Test:** integration test asserting that after a user is registered with a DOB, `GET /verification/prefill/:id` returns a non-null `date_of_birth`.

---

## Bug B — Improper error messages

### Error sources catalogued

| Source | Status | Body shape | Currently shown to user as |
|--------|--------|-----------|----------------------------|
| ai-services OCR — bad MIME | 400 | `{"detail": str(ValueError)}` | Raw Python ValueError message |
| ai-services OCR — bad doc type | 400 | `{"detail": "document_type must be…"}` | Technical field-name string |
| ai-services face — bad MIME | 400 | `{"detail": str(ValueError)}` | Raw Python ValueError message |
| ai-services legacy verify — image download fail | 200* | `{"status":"manual_review","error":"Failed to download image: <httpx exc>"}` | Raw httpx exception string |
| ai-services any route — Pydantic 422 | 422 | `{"detail": [{type, loc, msg, input}]}` | Not handled; raw array if shown |
| Express verificationController uploadId | 500 | `{"error": err.stack \|\| err.message}` | Stack trace or JS error message |
| Express global handler (dev) | 500 | `{"error": err.message, "stack": err.stack}` | Stack trace in dev mode |
| Frontend network error (catch block) | N/A | `err.message` from TypeError/fetch | Raw JS exception message (e.g. "Failed to fetch") |
| VerificationDetailsModal status | N/A | `verification_status` enum string | "manual_review", "pending" verbatim |

*ai-services legacy route returns 200 with `status:"manual_review"` embedded in body even on error.

### Where it breaks

Three independent break points:

**B1 — `frontend/src/pages/verify/index.tsx` lines 162 and 264:** Network errors in the `uploadId` and `uploadSelfie` fetch calls are caught and fed directly into `setError(err.message)`. A plain `TypeError: Failed to fetch` becomes the user-visible error string.

**B2 — `backend/src/controllers/verificationController.js` line 216:** The `uploadId` handler catches unhandled errors and returns `error: err.stack || err.message`. Stack traces leak to the client when `err.stack` is set.

**B3 — `frontend/src/components/VerificationDetailsModal.tsx` lines 158-159:** `verification_status` is rendered with only `charAt(0).toUpperCase()` normalisation — "manual_review" becomes "Manual_review" (shows underscore), "pending" shows "Pending" without context.

There is **no error-code → user-friendly-string mapping layer** anywhere in the frontend.

### Proposed fix

- **B1 (frontend catch blocks):** Replace `setError(err.message)` with a `toUserMessage(err)` helper that maps known network/fetch errors to plain strings, with a safe fallback.
- **B2 (Express uploadId 500):** Replace `err.stack || err.message` with a fixed string `"Failed to process ID document. Please try again."` (log the real error server-side only).
- **B3 (status display):** Add a `STATUS_LABELS` map in the frontend that translates `verified → "Verified"`, `pending → "Under Review"`, `manual_review → "Under Manual Review"`, `failed/rejected → "Not Verified"`.

---

## Proposed Implementation Chunks

### Chunk 1 — Fix DOB in prefill endpoint (Bug A)
**Scope:** `backend/src/controllers/verificationController.js` only
- Add `dob` to SELECT on line 62
- Map `date_of_birth: user.dob || null` in response on line 77
- **Tests:** Jest/supertest — `GET /verification/prefill/:id` returns `date_of_birth` equal to the value stored in the DB
- **Do NOT touch:** frontend, auth controller, any other controller

### Chunk 2 — Remove stack-trace / raw-error leakage from Express (Bug B-B2)
**Scope:** `backend/src/controllers/verificationController.js` line 216 only
- Replace `err.stack || err.message` with a fixed user-safe string; keep `console.error` for logging
- **Tests:** test that a 500 response body does not contain `"stack"` or `"Error:"` patterns
- **Do NOT touch:** global error handler in server.js (separate concern), frontend

### Chunk 3 — Sanitise frontend network errors (Bug B-B1)
**Scope:** `frontend/src/pages/verify/index.tsx` lines 162 and 264 only
- Extract a `toUserMessage(err)` helper (inline in the file or a tiny `src/utils/errorMessages.ts`); map fetch/network errors to plain strings
- **Tests:** unit test the helper for `TypeError: Failed to fetch`, `SyntaxError`, generic `Error`
- **Do NOT touch:** any other page, the status modal

### Chunk 4 — User-friendly status labels (Bug B-B3)
**Scope:** `frontend/src/components/VerificationDetailsModal.tsx` only
- Add a `STATUS_LABELS` constant mapping all known statuses to display strings
- Replace the raw `charAt(0).toUpperCase()` call with a lookup
- **Tests:** unit test that each known status maps to the expected label string, and unknown statuses fall back gracefully
- **Do NOT touch:** any other component, backend

---

## Open questions for the user

1. **Bug B — wording sign-off:** The error strings I'll write are listed below. Please confirm or edit before I implement:
   - Network/fetch failure: *"Something went wrong while uploading. Please check your connection and try again."*
   - ID process failure (Express 500): *"Failed to process ID document. Please try again."*
   - Status labels: verified → **"Verified"**, pending → **"Under Review"**, manual_review → **"Under Manual Review"**, rejected/failed → **"Not Verified"**

2. **Bug B — global error handler (`server.js`):** The dev-mode handler leaks `err.message` and `err.stack`. Should I fix that in this PR too (simple one-liner — remove the `isDev` branch and always return `"Internal Server Error"`)? Marking it out-of-scope for now unless you say otherwise.

3. **Bug A — `public.users` schema:** The investigation confirms `dob` is stored in `public.users.dob`. Is the column definitely named `dob` (not `date_of_birth` or `birth_date`) in the actual Supabase schema? The registration code uses `dob` — assuming that's correct unless you say otherwise.
