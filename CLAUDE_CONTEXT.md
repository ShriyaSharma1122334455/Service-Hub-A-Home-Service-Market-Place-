# ServiceHub — Claude Session Context & Handoff

> **Last updated:** April 30, 2026  
> **Session owner:** Deep Talreja (dt443@njit.edu)  
> **Purpose:** Full handoff context so any new Claude session can resume exactly where this one left off.

---

## 1. Project Overview

**ServiceHub** — a home-service marketplace (cleaning, plumbing, electrical, pest control).  
Customers browse service providers, book slots, and leave reviews.  
Providers manage bookings via a dashboard.

### Stack
| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js + Express.js |
| Database | Supabase (PostgreSQL + Auth + Storage) |
| AI Services | FastAPI (Python) + Docker — visual damage assessment |
| Auth | Supabase JWT — stored in localStorage key `servicehub-auth` |
| CI/CD | GitHub Actions (ESLint + build check on every PR) |

### Repo
```
https://github.com/ShriyaSharma1122334455/Service-Hub-A-Home-Service-Market-Place-
```

### Local paths
```
Project root:   /Users/deep_anmol/Desktop/ServiceHub_Deep/ServiceHub_Shriya/
Frontend:       .../frontend/src/
Backend:        .../backend/src/
Preview server: Vite on http://localhost:5173
Backend:        Express on http://localhost:3000
```

---

## 2. Current Sprint: Final Week — Sprint 6 (Deadline May 1, 2026)

This is the LAST sprint. All features must be completed, tested, and the project submitted.

### Team assignments
| # | Feature | Owner(s) |
|---|---|---|
| 1 | Auth & Session QA + Profile | Shriya Sharma |
| 2 | Customer Dashboard | Shriya + Prithvi + Jay |
| 3 | Provider Dashboard | Shriya + Prithvi + Jay |
| 4 | Service Catalog & Search | **Akash Deore + Deep Talreja** |
| 5 | Booking flow (full end-to-end) | **Akash Deore** |
| 6 | Review & Rating | **Deep Talreja** |

---

## 3. All PRs by Deep Talreja (full history)

| PR | Branch | Status | Description |
|---|---|---|---|
| **#70** | `fix/issue-54-pagination-count` | ✅ Merged | Add `count:'exact'` to providerController + serviceController |
| **#71** | `feat/ser-113-service-provider-info` | ✅ Merged | Service catalog category cards + ServiceProviders page |
| **#72** | `feat/ser-123-provider-reviews` | ✅ Merged | Reviews section on provider profile + avg rating card |
| **#73** | `feat/ser-132-chatbot-real-bookings` | ✅ Merged | `/api/chatbot/context` endpoint + wire Chatbot.tsx to real data |
| **#77** | `feat/ser-122-submit-review` | ✅ Merged | Submit review form + double-unwrap bugfix + route typo fix |

All of Deep's PRs are merged to main.

### Current branch status
- `feat/ser-122-submit-review` — still has local commits beyond merged PR77.
  - Has `.claude/CLAUDE.md` and `CLAUDE_CONTEXT.md` pushed to origin branch.
  - `.claude/` folder was removed from this branch (see cleanup commit).
  - This branch is stale and can be deleted.

---

## 4. Latest main branch state (as of Apr 30, 2026)

Most recent commits to main (newest first):

| # | Commit | PR | Description |
|---|---|---|---|
| 1 | `b2df9da` | #91 | Return customer details in booking responses + enhance provider search |
| 2 | `23d28cd` | #90 | Customer dashboard with appointment schedule and booking stats |
| 3 | `11715bd` | #89 | Service Catalog & Search — browse/filter, provider public profile, seed |
| 4 | `543800c` | #87 | Provider dashboard booking status |
| 5 | `9689f8c` | #86 | Calendar view for bookings |
| 6 | `f5c89c7` | #69 | Visual Damage Assessment AI service |
| 7 | `4694b02` | #85 | Fix auth tests (signUp vs createUser mocks) |
| 8 | `1eddb02` | #83 | AI-powered identity verification system |
| 9 | `a0ade89` | #77 | Submit review form (Deep) |
| 10 | `0285477` | #73 | Chatbot real booking data (Deep) |
| 11 | `de2c339` | #72 | Provider reviews UI (Deep) |
| 12 | `c7e7a92` | #71 | Service catalog (Deep) |
| 13 | `cbd3970` | #70 | Pagination count fix (Deep) |

---

## 5. Jira Task Status — Deep Talreja (Verified Against Code)

### ✅ COMPLETED (verified in main)
| Ticket | Summary | PR |
|---|---|---|
| SER-12 | Document architecture & API endpoints | — |
| SER-20 | Design schema for reviews & complaints | — |
| SER-34 | Provider Work order dashboard | — |
| SER-38 | Add Reviews & Ratings (story) | #72, #77 |
| SER-60 | Update MongoDB schema validation | — |
| SER-61 | Service catalog page UI | #71 |
| SER-66 | Calendar view (weekly/monthly) | — |
| SER-79 | Review submission API | #77 |
| SER-80 | Review UI component | #72, #77 |
| SER-81 | Update rating calculation | #72 |
| SER-122 | Submit review after completed booking | #77 |
| SER-123 | See reviews on provider profile | #72 |
| SER-132 | Chatbot with real booking data | #73 |
| SER-147 | Verify GET /api/reviews/:providerId | #72 |
| SER-148 | Auto-update avg rating after new review | #72 |
| SER-149 | Reviews section UI on provider profile | #72 |
| SER-150 | Star avg at top of profile | #72 |
| SER-151 | Empty state (no reviews) | #72 |
| SER-179 | BE: GET /api/services?category= | #71 |
| SER-180 | UI: Category cards grid | #71 |
| SER-181 | UI: Service list with price/provider | #71 |

### ⚠️ JIRA STATUS WRONG — needs update
| Ticket | Summary | Jira Says | Actual |
|---|---|---|---|
| SER-39 | View Reviews (story) | In Progress | ✅ Done — code exists in PR #72 |

### ❌ PENDING — Not Done
| Ticket | Summary | Priority | Notes |
|---|---|---|---|
| SER-182 | Search services by keyword | High | Carryover from Sprint 5, MUST DO this week |
| SER-125 | 24hr reminder before booking (story) | Low | Can skip — Jira says "last priority if no time" |
| SER-167 | Create reminder email template (Resend) | Lowest | Sub-task of SER-125, skip |
| SER-168 | Set up scheduled job/cron | Lowest | Sub-task of SER-125, skip |
| SER-169 | Test reminder trigger | Lowest | Sub-task of SER-125, skip |

---

## 6. Unassigned Jira Tasks Deep Can Own (Final Week)

Pulled from Unassigned.csv — sorted by priority for last week:

### High Priority (our domain — reviews + catalog)
| Ticket | Summary | Why Deep |
|---|---|---|
| SER-182 | Keyword search for services | Deep owns service catalog |
| SER-83 | Pagination for reviews | Deep built review system |
| SER-82 | Fetch reviews by service | Deep built review system |

### Medium Priority (security — final sprint)
| Ticket | Summary | Notes |
|---|---|---|
| SER-88 | Rate limiting | Already partially done in server.js (express-rate-limit imported) |
| SER-89 | Helmet middleware | Already done in server.js (helmet imported + used) |
| SER-90 | Input sanitization | Add to controllers — quick win |
| SER-91 | Secure cookies | Update auth cookie config |

### Lower Priority (if time allows)
| Ticket | Summary | Notes |
|---|---|---|
| SER-96 | End-to-end testing | Sprint 6 scope |
| SER-93 | Lazy load frontend components | React.lazy() |
| SER-94 | Optimize image loading | Add loading="lazy" to img tags |
| SER-95 | Setup production env vars | Fill in Vercel/Railway env |

### Skip for now (team-owned or complex)
- SER-84 to SER-87: AI verification (Prithvi owns these)
- SER-92: Optimize MongoDB indexes (now Supabase — not applicable as stated)
- SER-40: AI ID verification (Prithvi)

---

## 7. Plan — How to Complete the Project (Final Week)

### Day 1 (Apr 30)
- [x] Clean up `.claude` folder from PR branch
- [ ] **SER-182**: Implement keyword search in service catalog
  - Backend: `GET /api/services?search=<keyword>` (ilike filter on name/description)
  - Frontend: Add search input to ServiceProviders.tsx

### Day 2 (May 1 — DEADLINE)
- [ ] **SER-83**: Pagination for reviews (limit/offset on GET /api/reviews/:id)
- [ ] **SER-82**: Fetch reviews by service ID
- [ ] **SER-90**: Input sanitization (trim + validate in controllers)
- [ ] Mark SER-39 as Done in Jira
- [ ] Final end-to-end smoke test (LOCAL_RUN_GUIDE.txt)

### If time allows
- [ ] SER-93/94: lazy loading + image optimization
- [ ] SER-96: write basic e2e tests

---

## 8. Key Files Modified by Deep This Project

### Backend
| File | What it does |
|---|---|
| `backend/src/controllers/providerController.js` | Provider CRUD, pagination count fix |
| `backend/src/controllers/serviceController.js` | Service listing, category filter |
| `backend/src/controllers/reviewController.js` | GET reviews with booking_id, POST review |
| `backend/src/controllers/chatbotController.js` | GET /api/chatbot/context (aggregates bookings) |
| `backend/src/routes/chatbotRoutes.js` | Route file for chatbot |
| `backend/src/server.js` | Mounted chatbot route |

### Frontend
| File | What it does |
|---|---|
| `frontend/src/pages/Profile.tsx` | Reviews section, avg rating, review submission form |
| `frontend/src/pages/ServiceProviders.tsx` | Category cards, provider cards, View Profile + Book |
| `frontend/src/components/Chatbot.tsx` | Real `/api/chatbot/context` call |
| `frontend/src/services/profile.ts` | Fixed route typo: `/provider/:id` → `/providers/:id` |

---

## 9. Critical Bugs Found & Fixed

### Bug 1 — Double-unwrap in Profile.tsx (PR #77)
`fetchApi()` in `frontend/src/lib/api.ts` already extracts `.data` from response body.
**Never** access `.data` a second time on the result:
```ts
// WRONG (double-unwrap):
const payload = res.data as { data: Review[] };
setReviews(payload.data); // always undefined!

// CORRECT:
setReviews(Array.isArray(res.data) ? res.data : []);
```

### Bug 2 — Provider route typo in profile.ts (PR #77)
```ts
// BROKEN: return fetchApi(`/provider/${id}`);   ← 404 always
// FIXED:  return fetchApi(`/providers/${id}`);
```

---

## 10. Test Accounts

| Email | Password | Role |
|---|---|---|
| `deep_user1@yopmail.com` | `TestPass123!` | Customer |
| `deep_plumber@yopmail.com` | `TestPass123!` | Provider |

### Key UUIDs
| Entity | UUID |
|---|---|
| Deep Clean Pro (provider) | `58239207-aec2-4d80-955a-bc450d78a903` |
| Deep Plumber Services (provider) | `e70895b3-c86f-4f43-b63a-7229126a109d` |
| Deep Electrical Solutions (provider) | `f8060271-7e4d-444c-bb0f-ce89d82c0490` |
| Rivera Plumbing & Electric (provider) | `10052bf0-9927-43a2-8df1-b7eacc1de382` |
| Deep Clean (service) | `2be5a06d-4818-4fe5-9bfc-c664e5540456` |
| Drain Cleaning (service) | `c7c72cd1-b811-423c-a555-27a91cf2ec07` |
| Insect Removal (service) | `4e29444f-cacf-4d2a-8998-d5458a6480c4` |

---

## 11. Architecture Notes

### Routing
Hash-based: `window.location.hash = '#/path'`  
Key routes:
- `/#/` — Home page (category cards)
- `/#/book/:serviceId` — ServiceProviders page
- `/#/profile/:id?type=provider` — Provider profile
- `/#/profile/:id?type=user` — User profile
- `/#/profile/me` — Own profile
- `/#/dashboard` — Provider dashboard
- `/#/my-bookings` — ProviderBookings page
- `/#/booking-confirmation/:id` — BookingConfirmation

### fetchApi() — CRITICAL BEHAVIOUR
```ts
// api.ts returns:
return { success: true, data: data.data || data };
// It ALREADY unwraps .data from the response body.
// CORRECT:  const res = await fetchApi<Review[]>('/reviews/123');  setReviews(res.data);
// WRONG:    const payload = res.data as { data: Review[] };  setReviews(payload.data); // undefined!
```

### Auth token
Stored in `localStorage` under key `servicehub-auth`:
```json
{ "email": "...", "role": "customer", "name": "...", "avatar": "...", "accessToken": "..." }
```
`fetchApi()` gets the token from Supabase session directly (`supabase.auth.getSession()`).

---

## 12. Known Issues & Blockers

### 🟡 provider_services table
`GET /api/providers/by-service/:serviceId` may return `[]` if `provider_services` junction table has no rows.
- PR #89 added seeding — check if this is now resolved.

### 🟡 SER-182 — Keyword search not built
Free-text search bar for services was in Sprint 5 scope but not done. **Must complete this week.**

---

## 13. Recently Created Branches — Explanation

### `origin/feat/ser-122-submit-review` (today Apr 30)
This is Deep's PR #77 branch. After PR was merged on Apr 18, a new commit was pushed to this branch today:
- `6c34b71 docs: add Claude session context and project memory files`
- This added `.claude/CLAUDE.md` and `CLAUDE_CONTEXT.md` — created by Claude Code session as handoff notes.
- The `.claude/` folder has been removed from this branch. Branch is stale and can be deleted.

### `origin/copilot/add-simple-explanation`, `origin/copilot/analyze-recent-development`, `origin/copilot/analyze-recent-failed-approach`
These were auto-created by GitHub Copilot when someone ran a Copilot agent task. Copilot creates its own branches. Safe to ignore or delete.

### `origin/docs/readme-update-20260418*`
Auto-created by the GitHub Actions README update workflow. The workflow creates a temporary branch to update the README changelog. These are stale workflow branches, can be deleted.

### `origin/ShriyaSharma1122334455-patch-1`
Created by Shriya directly on GitHub UI (patch edit). Can check if it needs a PR or if it's stale.

---

## 14. Useful Commands

```bash
# Navigate to project
cd /Users/deep_anmol/Desktop/ServiceHub_Deep/ServiceHub_Shriya

# Start frontend
cd frontend && npm run dev

# Start backend
cd backend && npm run dev

# Check PR status
git log --oneline origin/main | head -15

# Get a fresh Supabase token (bypasses rate limit)
# POST $SUPABASE_URL/auth/v1/token?grant_type=password
# body: {"email":"deep_user1@yopmail.com","password":"TestPass123!"}

# Delete stale local branches (after verifying merged)
git branch -d feat/ser-122-submit-review
git branch -d feat/ser-113-service-provider-info
git branch -d feat/ser-123-provider-reviews
git branch -d feat/ser-132-chatbot-real-bookings
git branch -d fix/issue-54-pagination-count
```

---

*Context last updated April 30, 2026 — reflects state after Sprint 5 complete, entering final submission week.*
