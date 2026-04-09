# Lesson Learned: CI Pipeline Left Behind During MongoDB → Supabase Migration

> **Sprint:** Sprint 3 (last two weeks, ending ~April 9, 2026)
> **Evidence:** Issue [#45](https://github.com/ShriyaSharma1122334455/Service-Hub-A-Home-Service-Market-Place-/issues/45), Issue [#38](https://github.com/ShriyaSharma1122334455/Service-Hub-A-Home-Service-Market-Place-/issues/38), Issue [#44](https://github.com/ShriyaSharma1122334455/Service-Hub-A-Home-Service-Market-Place-/issues/44), PR [#29](https://github.com/ShriyaSharma1122334455/Service-Hub-A-Home-Service-Market-Place-/pull/29), PR [#61](https://github.com/ShriyaSharma1122334455/Service-Hub-A-Home-Service-Market-Place-/pull/61)

---

## 1. What the Team Tried (and What Failed)

In Sprint 3, the team made a large backend change: they migrated the entire database layer from **MongoDB + Mongoose** to **Supabase (PostgreSQL)** (PR #29, merged April 2, 2026). This was a meaningful improvement — it fixed the JWT sync issues between Supabase Auth and MongoDB that had been breaking authentication since Sprint 2.

**The migration itself was done well.** The backend team replaced every Mongoose model, rewrote all controllers to use the Supabase JS client, and removed the old `bcryptjs`/`jsonwebtoken` local auth stack.

**What failed:** The **CI/CD pipeline was not updated to match the new stack.**

After the migration, every single push to GitHub triggered a CI build that immediately broke, because:

- `ci.yml` still set `MONGO_URI` as an environment variable and spun up a MongoDB Docker service container.
- The three new Supabase secrets — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — were **never added** to the CI environment block.
- The backend server throws on startup when `supabase.js` can't find `SUPABASE_URL`, so **zero tests ran** on every push for days.
- The test files (`app.test.js`, `search-filter.test.js`) still `import mongoose` and `MongoMemoryServer` — modules that no longer exist in the repo — causing the Jest test runner to crash before running a single test.
- Dead npm packages (`bcryptjs`, `jsonwebtoken`, `express-mongo-sanitize`) stayed in `package.json`, misleading future developers.

**In short:** The team replaced the database engine but forgot to update the automated checks that verify the code works.

### Concrete evidence

| Artifact | What it shows |
|---|---|
| **PR #29** (Apr 2) | Migrated backend to Supabase — 39 files changed, 2,135 additions. `ci.yml` was *not* in the changed files. |
| **Issue #45** (opened Apr 2, closed Apr 6) | "GitHub Actions CI pipeline fails on every push — workflow still sets `MONGO_URI` and waits for MongoDB service, but never sets `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY`" |
| **Issue #44** (opened Apr 2, open) | "Entire Jest test suite crashes before a single test runs — all test files still import `mongoose`, `MongoMemoryServer` and Mongoose model files that no longer exist" |
| **Issue #38** (opened Apr 2, closed Apr 5) | "Dead backend dependencies — `bcryptjs`, `jsonwebtoken`, `express-mongo-sanitize` still in `package.json`" |
| **CI run logs (Apr 2–8)** | Every run shows `conclusion: failure`. The backend job crashed at the `supabase.js` startup check with no `SUPABASE_URL` set. |

---

## 2. The Resolution (in Simple Words)

The team filed **Issue #45** to track the broken CI. The fix took about four days (April 2 → April 6):

1. **Removed** the MongoDB service container, the `Wait for MongoDB` step, and the `MONGO_URI` env var from `ci.yml`.
2. **Added** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the CI environment block (reading from GitHub repository secrets).
3. **Added Python folder checks** for the AI service jobs, which were also failing.
4. **Removed** the dead `bcryptjs`, `jsonwebtoken`, and `express-mongo-sanitize` packages from `package.json` (Issue #38, closed Apr 5).
5. **Fixed** the cascade of post-migration bugs (hardcoded statuses, missing ownership checks, broken booking lifecycle) in PR #61 (merged Apr 8).

The comment on Issue #45 when closing it reads: *"Changed the Ci.yml file as per supabase. Also added checks for Python folders."*

---

## 3. Root Cause Category

**Primary cause: Failure in cross-disciplinary communication.**

The team member who did the database migration (backend engineering) and the team member who owned the CI pipeline (DevOps / build engineering) did not coordinate. The migration PR (#29) touched 39 files — controllers, routes, middleware, the server entry point, the frontend — but `ci.yml` was not in those 39 files. Nobody flagged it in the PR review.

A secondary, smaller cause was a **lack of specialized training**: the team did not yet have a shared checklist or rule that said *"every infrastructure change must include a corresponding CI update"*. Without that habit, it is easy to forget.

| Category | Applies? | Notes |
|---|---|---|
| Cross-disciplinary communication failure | ✅ **Primary** | Backend team and DevOps/CI owner did not sync during the migration PR |
| Lack of specialized training | ⚠️ Secondary | No team process required a CI update alongside every infra change |

---

## 4. How the Technical Strategy Evolved

Because of this failure, the team's approach changed in three concrete ways:

### a) Dedicated QA branches per team member
After the migration, the team stopped committing fixes directly to `main`. Branches like `Shriya_QA`, `fix/DEEP_QA`, `fix/Akash_QA`, and `jay_QA` appeared in the CI history. Each person now validates their piece before merging — a structural change enforced through branch naming convention.

### b) Structured QA issue tracking
Issues #37–#58 were all filed on the same day (April 2) as a comprehensive QA sweep of the post-migration codebase. Instead of discovering problems one at a time in production, the team now pre-lists known gaps and assigns them before a sprint ends.

### c) CI coverage extended to Python services
The fix for Issue #45 also added Python service checks (`ai-services`, `visual-damage-assessment`) to the CI pipeline. Previously only the Node.js backend and frontend were tested automatically. The migration failure revealed that the Python microservices were also untested in CI.

### What the team should add next (lessons for future sprints)
- **Add a CI update checklist item to every PR template**: "Did you update `.github/workflows/ci.yml` to match this change?"
- **Use a PR template that requires a test plan**: PR #61 already did this (`## Test plan` section with checkboxes). Apply the same pattern to all PRs.
- **Pin CI to the same env-var list as production**: Keep a single `.env.example` as the source of truth; fail the PR if a new env var is used in code but missing from `.env.example` and `ci.yml`.

---

## 5. Concrete Implementation Evidence

### Before the fix — what the broken `ci.yml` looked like

The original `ci.yml` (from PR #21, CI/CD implementation, March 8) had:

```yaml
# ❌ OLD — MongoDB-era CI (still there after Supabase migration on April 2)
services:
  mongodb:
    image: mongo:7
    ports: ['27017:27017']

env:
  MONGO_URI: mongodb://localhost:27017/servicehub_test
  JWT_SECRET: test-secret-key
  # SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY — all missing

steps:
  - name: Wait for MongoDB
    run: |
      until mongosh --eval "db.runCommand('ping').ok"; do
        sleep 1
      done
```

Because `SUPABASE_URL` was never set, `config/supabase.js` (added in PR #29) threw this error immediately:

```
Error: Missing required environment variable: SUPABASE_URL
```

…and the backend never started, so every test got `ECONNREFUSED` against `http://localhost:3000`.

### After the fix — the corrected CI env block

```yaml
# ✅ NEW — Supabase-era CI (fixed ~April 6)
env:
  NODE_ENV: test
  SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
  # MONGO_URI and MongoDB service container removed
```

### The test crash caused by leftover Mongoose imports

Before the test files were cleaned up (Issue #44), running `npm test` produced:

```
Cannot find module 'mongoose'
    at app.test.js:3:1

Cannot find module 'mongoose-memory-server'
    at search-filter.test.js:2:1

Test Suites: 2 failed, 0 passed
Tests:       0 skipped
```

The fix (described in Issue #44) was to rewrite both test files using the `setSupabaseClient()` DI pattern already established in `authMiddleware.test.js` — no real DB calls, no Mongoose imports.

### The dead-dependency cleanup (Issue #38, PR closed Apr 5)

```diff
# backend/package.json
-  "bcryptjs": "^2.4.3",
-  "jsonwebtoken": "^9.0.0",
-  "express-mongo-sanitize": "^2.2.0",
```

These three packages were used by the old local JWT auth layer (removed in PR #29) but were left in `package.json`. Removing them closed the gap between what the code actually uses and what `package.json` advertises.

---

## Summary

| Field | Value |
|---|---|
| **Failed approach** | MongoDB→Supabase backend migration (PR #29) done without updating the CI pipeline |
| **Symptom** | Every CI run failed (`conclusion: failure`) for ~4 days; no tests ran at all |
| **Root cause** | Cross-disciplinary communication failure: backend dev and CI owner did not coordinate |
| **Resolution** | Updated `ci.yml` to use Supabase secrets; removed MongoDB service container; cleaned up dead packages and test imports |
| **Strategy change** | Per-person QA branches, structured issue tracking, CI extended to Python services |
| **Key issues** | [#45](https://github.com/ShriyaSharma1122334455/Service-Hub-A-Home-Service-Market-Place-/issues/45) (CI), [#44](https://github.com/ShriyaSharma1122334455/Service-Hub-A-Home-Service-Market-Place-/issues/44) (tests), [#38](https://github.com/ShriyaSharma1122334455/Service-Hub-A-Home-Service-Market-Place-/issues/38) (dead deps) |
| **Key PRs** | [#29](https://github.com/ShriyaSharma1122334455/Service-Hub-A-Home-Service-Market-Place-/pull/29) (migration), [#61](https://github.com/ShriyaSharma1122334455/Service-Hub-A-Home-Service-Market-Place-/pull/61) (QA fixes) |
