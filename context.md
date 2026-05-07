# Bug-Fix-3 — Session Context

**Branch:** `feat/Bug-Fix-3`
**Last updated:** 2026-05-06
**Current phase:** Phase 2 — Complete
**Last completed step:** Step 5 — All 16 steps done, all tests green

---

## Work completed before this session

| ID | Description | Status |
|----|-------------|--------|
| Bug A | DOB not shown in verification prefill | ✅ Fixed (`getPrefill` — single query, `dob` in SELECT) |
| Bug A (frontend guard) | `userId` empty → prefill fetch silently skipped | ✅ Fixed (session fallback added) |
| Bug B-B2 | Stack trace leaked from `uploadId` 500 response | ✅ Fixed (safe string returned) |
| OCR DL doc number | "Not found" for driver's licenses — broken date filter + missing all-digit patterns | ✅ Fixed (`ocr_service.py`) |

---

## Bugs in scope — Phase 2

| ID | Description | File(s) | Status |
|----|-------------|---------|--------|
| P2-1 | `uploadId` UPSERT overwrites previous attempts — no per-attempt history | `verificationController.js` | ✅ Fixed |
| P2-2 | `face_match_score` always 0.0 — backend extracts wrong field (`similarity_score` vs `similarity`) | `verificationController.js:314` | ✅ Fixed |
| P2-3 | Stack trace leak in `uploadSelfie` 500 response (same pattern as fixed Bug B-B2, different function) | `verificationController.js:329` | ✅ Fixed |
| P2-4 | "Document OCR: Not yet scanned" — UI reads `ocr_result.extracted_data.full_name` (never exists); data is stored flat as `ocr_result.extractedName` | `VerificationDetailsModal.tsx` | ✅ Fixed |
| P2-5 | Face Match similarity always "—", match always "❌ No" — UI reads `similarity_score`/`is_match`; stored as `similarity`/`matched` | `VerificationDetailsModal.tsx` | ✅ Fixed |
| P2-6 | NSOPW status never shown — UI reads `nsopw_result.status`/`is_clear`; stored as `nsopwStatus`/`matchFound` | `VerificationDetailsModal.tsx` | ✅ Fixed |
| P2-7 | Registry only hits NSOPW.gov scraper regardless of jurisdiction; faster direct REST APIs exist for IA, MO, DC, Chicago | `nsopw_service.py`, `nsopw_routes.py`, `verificationController.js` | ✅ Fixed |
| P2-8 | Existing tests VER-PREFILL-01/02 will break — they mock two DB calls but `getPrefill` now makes one; mock data missing `dob` | `verificationPrefill.test.js` | ✅ Fixed |

---

## Architecture decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Schema: new `verification_attempts` tables vs fix in place | **Fix in place** — keep single `verifications` table, change UPSERT → INSERT | Smaller blast radius; unblocks the display bug faster |
| Registry: replace NSOPW vs route on top | **Route on top** — IA/MO/DC/Chicago REST APIs short-circuit before Playwright NSOPW | Keeps existing fallback, adds coverage for four jurisdictions |
| OCR route: legacy JSON+URL vs new multipart | **Keep legacy** `/api/v1/verify/document` | No change to call pattern; RT-14 test already validates legacy route stays registered |
| Field normalization layer | **Frontend** (`VerificationDetailsModal.tsx`) + **backend extraction fix** (line 314) | Changing the Python service would break all OCR test assertions (`extractedName` etc.); frontend fix is one file, zero test breakage |

---

## Root cause map

### P2-1 — UPSERT overwrites attempts
```
uploadId (line 167-192):
  → SELECT latest verifications row for user_id
  → If found: UPDATE it            ← obliterates previous OCR result
  → If not found: INSERT new row
```
Fix: remove the find-and-update branch; always INSERT.

### P2-2 + P2-3 — uploadSelfie bugs
```
Line 314:  face_match_score: faceMatchResult?.similarity_score || 0.0
                                               ^^^^^^^^^^^^^^^^
           AI service returns `similarity`, not `similarity_score` → always 0.0

Line 329:  error: err.stack || err.message || 'Failed to process selfie'
                   ^^^^^^^^^
           Leaks stack trace to client
```

### P2-4/5/6 — VerificationDetailsModal field mismatch

What the AI service stores in JSONB columns vs what the UI tries to read:

| Column | Stored key (AI output) | UI reads | Bug |
|--------|----------------------|----------|-----|
| `ocr_result` | `extractedName` | `extracted_data.full_name` | "Not yet scanned" |
| `ocr_result` | `extractedDOB` | `extracted_data.date_of_birth` | "—" |
| `ocr_result` | `documentNumber` | `extracted_data.id_number` | "—" |
| `ocr_result` | `confidence` | `confidence_score` | confidence hidden |
| `face_match_result` | `similarity` | `similarity_score` | "—" |
| `face_match_result` | `matched` | `is_match` | always "❌ No" |
| `nsopw_result` | `nsopwStatus` | `status` | status hidden |
| `nsopw_result` | `matchFound` | `is_clear` (inverted) | "—" |

### P2-7 — Registry jurisdiction routing
```
submitVerification → POST /ai/nsopw/check → nsopw_service.check_nsopw()
                                                 ↓
                                         Playwright NSOPW.gov (always)
```
Fix: add routing layer in `nsopw_service.py` — check state/city first, call specific REST APIs for IA/MO/DC/Chicago, fall back to Playwright NSOPW for everything else.

City extraction note: the backend currently doesn't pass `city` to the NSOPW call. For Chicago routing, we need `city`. Add city parsing in `submitVerification` from the OCR address string and add an optional `city` field to `NsopwCheckBody`.

### P2-8 — Broken existing tests
After the Bug A fix, `getPrefill` now makes **one** Supabase call (via `getInternalUser`) instead of two. The existing tests mock two calls and the mock data for the first call lacks `dob`. Both VER-PREFILL-01 and VER-PREFILL-02 will fail until updated.

---

## Implementation walkthrough

### Step 1 — Backend: three fixes in `verificationController.js`

**File:** `backend/src/controllers/verificationController.js`

#### 1a — UPSERT → INSERT (P2-1)
Remove lines 167–192 (the "find existing or create" block). Replace with a single INSERT:
```js
const { error: insertError } = await supabase
  .from('verifications')
  .insert({ user_id: internalUser.id, ...verificationPayload });
if (insertError) {
  console.error('Verification insert error:', insertError.message);
}
```
`uploadSelfie` and `submitVerification` already use `.order('created_at', { ascending: false }).limit(1).maybeSingle()` to find the latest record — no changes needed there.

#### 1b — Fix face_match_score extraction (P2-2)
Line 314:
```js
// Before
face_match_score: faceMatchResult?.similarity_score || 0.0,
// After
face_match_score: faceMatchResult?.similarity ?? 0.0,
```
(`??` used instead of `||` so a genuine 0.0 score is not replaced by the default.)

#### 1c — Fix uploadSelfie stack trace leak (P2-3)
Line 329:
```js
// Before
error: err.stack || err.message || 'Failed to process selfie'
// After
error: 'Failed to process selfie image. Please try again.'
```

#### 1d — Add city extraction + pass to NSOPW call (needed for P2-7)
In `submitVerification`, after the ZIP extraction block (after line ~421), add:
```js
// Extract city from OCR address for jurisdiction routing
let city = null;
if (typeof ocrAddress === 'string') {
  const cityMatch = ocrAddress.match(/,\s*([A-Za-z\s]+),\s*[A-Z]{2}/);
  if (cityMatch) city = cityMatch[1].trim();
}
```
Then update the NSOPW `fetch` body (line ~436) to include `city`:
```js
body: JSON.stringify({ firstName, lastName, state, zipCode, city }),
```

---

### Step 2 — Frontend: fix VerificationDetailsModal field mappings (P2-4/5/6)

**File:** `frontend/src/components/VerificationDetailsModal.tsx`

#### 2a — Update `VerificationData` interface
Replace the three nested result interfaces with the actual shapes the AI service returns and stores:
```ts
ocr_result?: {
  status?: string;
  extractedName?: string;
  extractedDOB?: string;
  documentNumber?: string;
  expiryDate?: string;
  issuingState?: string;
  confidence?: number;
  rejectionReason?: string | null;
};
face_match_result?: {
  status?: string;
  similarity?: number;
  matched?: boolean;
  faceDetectedInId?: boolean;
  faceDetectedInSelfie?: boolean;
};
nsopw_result?: {
  nsopwStatus?: string;
  matchFound?: boolean;
  matchDetails?: unknown[];
};
```

#### 2b — Fix OCR section reads
```ts
// Before
const ocrData = data?.ocr_result?.extracted_data;
// After — read directly from ocr_result
const ocrResult = data?.ocr_result;
```
Update the JSX to render `ocrResult?.extractedName`, `ocrResult?.extractedDOB`, `ocrResult?.documentNumber`, `ocrResult?.confidence`.
The "Not yet scanned" condition changes from `!ocrData` to `!ocrResult?.extractedName && !ocrResult?.extractedDOB`.

#### 2c — Fix Face Match reads
```ts
// Before
faceData?.similarity_score   →   faceData?.similarity
faceData?.is_match           →   faceData?.matched
```

#### 2d — Fix NSOPW reads
```ts
// Before
nsopwData?.status            →   nsopwData?.nsopwStatus
nsopwData?.is_clear          →   !nsopwData?.matchFound
nsopwData?.used_fallback     →   remove (field doesn't exist)
```

---

### Step 3 — AI Service: add registry jurisdiction routing (P2-7)

#### 3a — `ai-services/app/routes/nsopw_routes.py`
Add `city` as an optional field to `NsopwCheckBody`:
```python
city: Optional[str] = Field(None, description="City name, used for Chicago jurisdiction routing")
```
Pass it through to the service call:
```python
result = await nsopw_service.check_nsopw(
    first_name=body.firstName,
    last_name=body.lastName,
    state=body.state,
    zip_code=body.zipCode,
    city=body.city,          # new
)
```

#### 3b — `ai-services/app/services/nsopw_service.py`
Add `city: Optional[str] = None` to `check_nsopw` signature.

Add four helper coroutines **before** the existing `check_nsopw` function:

```python
async def _check_iowa(first_name: str, last_name: str) -> dict:
    """Iowa Sex Offender Registry — GET JSON API (50 req/hr cap)."""
    url = "https://www.iowasexoffender.gov/api/search/results.json"
    params = {"lastname": last_name, "firstname": first_name}
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
    records = data if isinstance(data, list) else data.get("results", [])
    match_found = len(records) > 0
    return {
        "nsopwStatus": "fail" if match_found else "pass",
        "matchFound": match_found,
        "matchDetails": [{"name": r.get("name", "")} for r in records[:5]],
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "source": "iowasexoffender.gov",
    }


async def _check_missouri(first_name: str, last_name: str) -> dict:
    """Missouri MSHP Sex Offender Registry — ArcGIS REST query."""
    url = (
        "https://www.mshp.dps.missouri.gov/arcgis/rest/services"
        "/NSOR/MapServer/7/query"
    )
    where = f"LAST_NAME='{last_name.upper()}' AND FIRST_NAME='{first_name.upper()}'"
    params = {
        "where": where,
        "outFields": "FIRST_NAME,LAST_NAME,CITY",
        "f": "json",
        "resultRecordCount": 10,
    }
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
    features = data.get("features", [])
    match_found = len(features) > 0
    return {
        "nsopwStatus": "fail" if match_found else "pass",
        "matchFound": match_found,
        "matchDetails": [
            {"name": f"{f['attributes'].get('FIRST_NAME','')} {f['attributes'].get('LAST_NAME','')}".strip()}
            for f in features[:5]
        ],
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "source": "mshp.dps.missouri.gov",
    }


async def _check_dc(first_name: str, last_name: str) -> dict:
    """Washington D.C. Sex Offender Registry — DC GIS FeatureServer query."""
    url = (
        "https://maps2.dcgis.dc.gov/dcgis/rest/services"
        "/FEEDS/MPD/FeatureServer/20/query"
    )
    where = f"LASTNAME='{last_name.upper()}' AND FIRSTNAME='{first_name.upper()}'"
    params = {"where": where, "outFields": "*", "f": "json", "resultRecordCount": 10}
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
    features = data.get("features", [])
    match_found = len(features) > 0
    return {
        "nsopwStatus": "fail" if match_found else "pass",
        "matchFound": match_found,
        "matchDetails": [
            {"name": f"{f['attributes'].get('FIRSTNAME','')} {f['attributes'].get('LASTNAME','')}".strip()}
            for f in features[:5]
        ],
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "source": "maps2.dcgis.dc.gov",
    }


async def _check_chicago(first_name: str, last_name: str) -> dict:
    """Chicago Sex Offender Registry — Socrata open data API."""
    url = "https://data.cityofchicago.org/resource/vc9r-bqvy.json"
    params = {"LASTNAME": last_name.upper(), "FIRSTNAME": first_name.upper()}
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        records = resp.json()
    match_found = len(records) > 0
    return {
        "nsopwStatus": "fail" if match_found else "pass",
        "matchFound": match_found,
        "matchDetails": [
            {"name": f"{r.get('FIRSTNAME','')} {r.get('LASTNAME','')}".strip()}
            for r in records[:5]
        ],
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "source": "data.cityofchicago.org",
    }
```

Add routing at the **top** of `check_nsopw` (before the existing Playwright call):
```python
async def check_nsopw(
    first_name: str,
    last_name: str,
    state: Optional[str] = None,
    zip_code: Optional[str] = None,
    city: Optional[str] = None,          # new param
) -> Dict[str, Any]:
    state_upper = (state or "").upper()
    city_upper = (city or "").upper()

    # ── Jurisdiction routing (REST APIs — faster, no browser) ─────────────
    try:
        if state_upper == "IA":
            return await _check_iowa(first_name, last_name)
        if state_upper == "MO":
            return await _check_missouri(first_name, last_name)
        if state_upper == "DC":
            return await _check_dc(first_name, last_name)
        if state_upper == "IL" and city_upper == "CHICAGO":
            return await _check_chicago(first_name, last_name)
    except Exception as exc:
        logger.error("Jurisdiction REST API failed (%s): %s", state_upper, type(exc).__name__)
        # Fall through to NSOPW Playwright scraper below

    # ── Default: NSOPW Playwright scraper ────────────────────────────────
    # ... (existing code unchanged)
```

---

### Step 4 — Tests: backend (P2-8 + new coverage)

**File:** `backend/src/tests/verificationPrefill.test.js`

#### 4a — Fix VER-PREFILL-01
The test currently mocks two `supabase.from` calls. After the Bug A fix, `getPrefill` makes one call. Update:
- Add `dob: '1990-03-15'` to `internalChain` data
- Remove `prefillChain` and the second `mockReturnValueOnce`
- Change `supabaseMock.from = jest.fn().mockReturnValueOnce(internalChain)` (single chain)

#### 4b — Fix VER-PREFILL-02
Same pattern: add `dob: null` to `internalChain` data, remove `prefillChain`.

#### 4c — Add VER-SELFIE-01: face_match_score uses `similarity`
```js
test('VER-SELFIE-01: face_match_score stored from similarity not similarity_score', async () => {
  // mock getInternalUser → user found
  // mock verifications lookup → record with id_document_url set
  // mock getSignedUrl → both signed URLs returned
  // mock fetch (AI face service) → { similarity: 87.5, matched: true, status: 'verified' }
  // mock verifications update → success
  // assert update was called with face_match_score: 87.5
});
```

#### 4d — Add VER-SELFIE-02: uploadSelfie 500 does not leak stack trace
Mirrors VER-UPLOAD-01 but for `uploadSelfie`:
```js
test('VER-SELFIE-02: 500 body does not contain stack trace', async () => {
  // throw from supabase.from
  // assert res.status(500) called
  // assert body.error === 'Failed to process selfie image. Please try again.'
  // assert body does not contain 'at Object.' or DB error message
});
```

#### 4e — Add VER-INSERT-01: uploadId always INSERTs a new row
```js
test('VER-INSERT-01: uploadId inserts a new verifications row even when one already exists', async () => {
  // mock getInternalUser → user found
  // mock file upload → success
  // mock getSignedUrl → success
  // mock fetch (AI OCR) → { extractedName: 'Jane Doe', extractedDOB: '1990-01-01', status: 'verified' }
  // mock supabase.insert → success (do NOT mock .select.eq... which would imply UPSERT check)
  // assert insert was called (not update)
  // assert insert was called with user_id and ocr_result
});
```

---

### Step 5 — Tests: Python registry routing

**New file:** `ai-services/tests/test_registry_routing.py`

```python
"""
test_registry_routing.py — REG-01 through REG-06
Verifies jurisdiction routing in check_nsopw().
"""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_reg01_iowa_routes_to_rest_api():
    """REG-01: state=IA routes to Iowa REST API, not NSOPW scraper."""
    # patch _check_iowa to return pass result
    # assert check_nsopw(state="IA") calls _check_iowa
    # assert source == "iowasexoffender.gov"

@pytest.mark.asyncio
async def test_reg02_missouri_routes_to_rest_api():
    """REG-02: state=MO routes to Missouri ArcGIS REST API."""

@pytest.mark.asyncio
async def test_reg03_dc_routes_to_rest_api():
    """REG-03: state=DC routes to DC GIS REST API."""

@pytest.mark.asyncio
async def test_reg04_chicago_routes_to_socrata():
    """REG-04: state=IL + city=Chicago routes to Chicago Socrata API."""

@pytest.mark.asyncio
async def test_reg05_illinois_non_chicago_uses_nsopw():
    """REG-05: state=IL + city=Springfield falls through to NSOPW (not Chicago API)."""

@pytest.mark.asyncio
async def test_reg06_rest_api_failure_falls_through_to_nsopw():
    """REG-06: if Iowa REST API raises an exception, falls through to NSOPW scraper."""
    # patch _check_iowa to raise httpx.HTTPError
    # patch the Playwright NSOPW path to return pass
    # assert final source is nsopw.gov
```

---

## Test plan summary

| Test ID | File | Type | Covers |
|---------|------|------|--------|
| VER-PREFILL-01 *(update)* | `verificationPrefill.test.js` | Unit | Bug A fix — single query, dob in mock |
| VER-PREFILL-02 *(update)* | `verificationPrefill.test.js` | Unit | Bug A fix — null dob case |
| VER-SELFIE-01 *(new)* | `verificationPrefill.test.js` | Unit | P2-2 — face_match_score from `similarity` |
| VER-SELFIE-02 *(new)* | `verificationPrefill.test.js` | Unit | P2-3 — no stack trace leak in uploadSelfie |
| VER-INSERT-01 *(new)* | `verificationPrefill.test.js` | Unit | P2-1 — always INSERT new row |
| REG-01 *(new)* | `test_registry_routing.py` | Unit | Iowa routing |
| REG-02 *(new)* | `test_registry_routing.py` | Unit | Missouri routing |
| REG-03 *(new)* | `test_registry_routing.py` | Unit | DC routing |
| REG-04 *(new)* | `test_registry_routing.py` | Unit | Chicago routing |
| REG-05 *(new)* | `test_registry_routing.py` | Unit | IL non-Chicago falls to NSOPW |
| REG-06 *(new)* | `test_registry_routing.py` | Unit | REST failure falls through to NSOPW |

---

## CI/CD requirements

CI pipeline: `.github/workflows/ci.yml` — three relevant jobs.

| Job | Trigger | Gate |
|-----|---------|------|
| `backend` | `npm test` (Jest) | Must pass: VER-PREFILL-01/02 (updated), new VER-* tests |
| `ai-services` | `flake8 .` then `pytest` | Must pass: existing RT-* tests unchanged, new REG-* tests |
| `frontend` | `npm run build` | TypeScript must compile after interface update in VerificationDetailsModal |

**No CI workflow changes needed** — all new tests fall under existing jobs.

**Env vars**: `AI_SERVICES_URL` and `AI_INTERNAL_API_KEY` are not in CI env blocks but are set directly inside the test file (`process.env.AI_SERVICES_URL = 'http://localhost:8000'` before the dynamic import) — this is intentional and works correctly.

**flake8**: new `test_registry_routing.py` and changes to `nsopw_service.py` / `nsopw_routes.py` must pass `flake8` with no E/W errors. Max line length is whatever the existing `.flake8` config specifies (check before submitting).

---

## Files to touch

| File | Change | Step |
|------|--------|------|
| `backend/src/controllers/verificationController.js` | UPSERT→INSERT, `similarity_score`→`similarity`, selfie stack trace fix, city extraction + NSOPW call | 1 |
| `frontend/src/components/VerificationDetailsModal.tsx` | Interface + field reads for OCR/face/NSOPW | 2 |
| `ai-services/app/routes/nsopw_routes.py` | Add `city` optional field to `NsopwCheckBody` | 3a |
| `ai-services/app/services/nsopw_service.py` | Add `city` param, four REST helper coroutines, routing block at top of `check_nsopw` | 3b |
| `backend/src/tests/verificationPrefill.test.js` | Fix VER-PREFILL-01/02, add VER-SELFIE-01/02, VER-INSERT-01 | 4 |
| `ai-services/tests/test_registry_routing.py` | New file — REG-01 through REG-06 | 5 |

---

## Progress tracker

| Step | Description | Status |
|------|-------------|--------|
| 1a | `uploadId` UPSERT → INSERT | ✅ |
| 1b | `face_match_score` field fix (`similarity`) | ✅ |
| 1c | `uploadSelfie` stack trace fix | ✅ |
| 1d | City extraction + pass to NSOPW call | ✅ |
| 2a | `VerificationData` interface update | ✅ |
| 2b | OCR section reads fix | ✅ |
| 2c | Face Match reads fix | ✅ |
| 2d | NSOPW reads fix | ✅ |
| 3a | `NsopwCheckBody` — add `city` field | ✅ |
| 3b | `nsopw_service.py` — routing + four helpers | ✅ |
| 4a | VER-PREFILL-01 test fix | ✅ |
| 4b | VER-PREFILL-02 test fix | ✅ |
| 4c | VER-SELFIE-01 new test | ✅ |
| 4d | VER-SELFIE-02 new test | ✅ |
| 4e | VER-INSERT-01 new test | ✅ |
| 5 | REG-01 through REG-06 new Python tests | ✅ |

---

## How to resume after interruption

1. `git checkout feat/Bug-Fix-3`
2. Re-read this file (`context.md`)
3. Find the first ⬜ row in the progress tracker
4. Read the corresponding step in the "Implementation walkthrough" section above
5. Implement, run tests locally, mark ✅, move to next step
6. When all steps are ✅ — run `npm test` (backend) and `pytest` (ai-services), confirm CI green
