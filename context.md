# Bug-Fix-2 Session Context

Branch: feat/Bug-Fix-2
Last updated: 2026-05-04T04:00:00Z
Last completed chunk: 7 (ALL DONE)

## Chunk Status
- [x] Chunk 1 — AI-CRIT-01 / AI-HIGH-02: Dev-mode bypass warnings + ENV validation
- [x] Chunk 2 — AI-CRIT-02: Face match threshold sourced from settings
- [x] Chunk 3 — AI-HIGH-01: Combined timeout on legacy face_route downloads
- [x] Chunk 4 — AI-HIGH-03: Replace test_api_routes.py with strict tests
- [x] Chunk 5 — AI-MED-01: MIME / magic-byte validation on uploads
- [x] Chunk 6 — AI-MED-02: Passport plain-text fallback
- [x] Chunk 7 — AI-LOW-01: NSOPW pending observability

## Files modified this session
- ai-services/app/routes/ocr_routes.py — verify_internal_key: warning on dev bypass, error on unknown ENV
- ai-services/app/routes/face_routes.py — same as ocr_routes
- ai-services/app/routes/nsopw_routes.py — same as ocr_routes
- ai-services/app/main.py — added logger; startup ENV validation in lifespan
- ai-services/app/services/face_service.py — removed FACE_MATCH_THRESHOLD constant; reads settings.FACE_MATCH_THRESHOLD at call time
- ai-services/app/routes/verification.py — added asyncio import + _fetch_face_images helper; verify_face now uses asyncio.wait_for(timeout=25.0) with except asyncio.TimeoutError → 504

## Tests added / changed
- tests/test_chunk1_bypass_warnings.py::test_rt15_bypass_logs_warning — Chunk 1
- tests/test_chunk1_bypass_warnings.py::test_aisec06_dev_mode_accessible_without_key — Chunk 1
- tests/test_chunk1_bypass_warnings.py::test_aisec02_empty_key_production — Chunk 1
- tests/test_chunk1_bypass_warnings.py::test_aisec03_wrong_key_production — Chunk 1
- tests/test_chunk1_bypass_warnings.py::test_unknown_env_enforces_key — Chunk 1
- tests/test_face_service.py::test_face_ut01_high_similarity_verified — Chunk 2
- tests/test_face_service.py::test_face_ut02_low_similarity_rejected — Chunk 2
- tests/test_face_service.py::test_face_ut03_threshold_from_settings — Chunk 2
- tests/test_verification_timeout.py::test_verify_face_timeout_returns_504 — Chunk 3

## Pending notes / decisions / follow-ups
- verification.py legacy route also has no auth bypass warning (verify_internal_key not updated there) — note for Bug-Fix-3 if needed; legacy route is out of scope per Chunk 1 definition
- verification.py legacy route hardcodes threshold_used: 90.0 in its response — deferred to Bug-Fix-3 per Chunk 2 scope rules

## How to resume after interruption
1. `git checkout feat/Bug-Fix-2`
2. `cd ai-services && python -m pytest -v` — all green expected
3. Re-read this file
4. Resume at "Last completed chunk" + 1
