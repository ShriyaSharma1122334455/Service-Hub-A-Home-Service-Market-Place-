# ServiceHub — Claude Session Context & Handoff

> **Last updated:** April 19, 2026  
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
Preview server: Vite on http://localhost:5173  (serverId: d5994593-a69d-4549-820a-4288df69aceb)
Backend:        Express on http://localhost:3000
```

---

## 2. Team & Sprint 5 Assignments (WhatsApp — Apr 19 2026)

| # | Feature | Owner(s) | Deadline |
|---|---|---|---|
| 1 | Auth & Session QA + Bug Fixing + Profile | Shriya Sharma | May 1 |
| 2 | Customer Dashboard (stats, bookings, search/filter) | Shriya + Prithvi + Jay | May 1 |
| 3 | Provider Dashboard (calendar, pending/confirmed) | Shriya + Prithvi + Jay | May 1 |
| 4 | Service Catalog & Search | **Akash Deore + Deep Talreja** | May 1 |
| 5 | Booking (browse → slot → confirm → accept/reject) | **Akash Deore** | May 1 |
| 6 | Review & Rating | **Deep Talreja** | May 1 |

---

## 3. All PRs Raised This Sprint (Deep + Akash)

| PR | Branch | Jira | Status | Description |
|---|---|---|---|---|
| **#70** | `fix/issue-54-pagination-count` | Issue #54 | ✅ Merged to main | Add `count:'exact'` to providerController + serviceController |
| **#71** | `feat/ser-113-service-provider-info` | SER-113/179/180/181 | ✅ Merged to main | Service catalog category cards + ServiceProviders page |
| **#72** | `feat/ser-123-provider-reviews` | SER-123/147-151 | ✅ Merged to main | Reviews section on provider profile + avg rating card |
| **#73** | `feat/ser-132-chatbot-real-bookings` | SER-132 | ✅ Merged to main | `/api/chatbot/context` endpoint + wire Chatbot.tsx to real data |
| **#77** | `feat/ser-122-submit-review` | SER-122 | 🟡 Open, CI passing | Submit review form + double-unwrap bugfix + route typo fix |

### PR #77 details (open — needs to be merged)
- Branch: `feat/ser-122-submit-review`
- Last commit: `a9e8b9e` — "fix(SER-122): correct double-unwrap in reviews/bookings fetch and provider route typo"
- CI: ✅ passing
- Ready to merge — no changes needed

---

## 4. Key Files Modified This Sprint

### Backend
| File | Change |
|---|---|
| `backend/src/controllers/providerController.js` | Added `{ count: 'exact' }` to `.select()` on line ~152 |
| `backend/src/controllers/serviceController.js` | Added `{ count: 'exact' }` to `.select()` on line ~7 |
| `backend/src/controllers/reviewController.js` | Added `booking_id` to GET /api/reviews/:providerId select |
| `backend/src/controllers/chatbotController.js` | **NEW** — GET /api/chatbot/context aggregating bookings by role |
| `backend/src/routes/chatbotRoutes.js` | **NEW** — route file for chatbot |
| `backend/src/server.js` | Mounted chatbot route: `app.use('/api/chatbot', chatbotRoutes)` |

### Frontend
| File | Change |
|---|---|
| `frontend/src/pages/Profile.tsx` | Reviews section, avg rating, review submission form, bugfixes |
| `frontend/src/pages/ServiceProviders.tsx` | Category cards, provider cards, View Profile + Book buttons |
| `frontend/src/components/Chatbot.tsx` | Real `/api/chatbot/context` call replacing dummy data |
| `frontend/src/services/profile.ts` | Fixed route typo: `/provider/:id` → `/providers/:id` |

---

## 5. Critical Bugs Found & Fixed This Sprint

### Bug 1 — Double-unwrap in Profile.tsx (PR #77, commit a9e8b9e)
**Problem:** `fetchApi()` in `frontend/src/lib/api.ts` already extracts `.data` from the JSON response body (`data: data.data || data`). But `Profile.tsx` was accessing `.data` a *second* time:
```ts
// BROKEN — always returns undefined
const payload = res.data as { count: number; data: Review[] };
setReviews(Array.isArray(payload.data) ? payload.data : []);

// FIXED
const res = await fetchApi<Review[]>(`/reviews/${providerId}`);
setReviews(Array.isArray(res.data) ? res.data : []);
```
Same bug existed in the bookings fetch for the review form — fixed the same way.

### Bug 2 — Provider route typo in profile.ts (PR #77, commit a9e8b9e)
```ts
// BROKEN — 404 on all provider profiles
return fetchApi<BackendProvider>(`/provider/${id}`);

// FIXED
return fetchApi<BackendProvider>(`/providers/${id}`);
```

### Bug 3 — Supabase login rate-limit during testing
`POST /api/auth/login` has a 15-min / 10-attempt rate limit in the app layer.  
**Workaround:** Call Supabase auth directly:
```bash
curl -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -d '{"email":"deep_user1@yopmail.com","password":"TestPass123!"}'
```

---

## 6. Test Accounts

| Email | Password | Role | Internal ID |
|---|---|---|---|
| `deep_user1@yopmail.com` | `TestPass123!` | Customer | Set via Supabase admin API |
| `deep_plumber@yopmail.com` | `TestPass123!` | Provider | "Deep Plumber Services" |

### Test provider IDs in Supabase
| Provider | UUID |
|---|---|
| Deep Clean Pro | `58239207-aec2-4d80-955a-bc450d78a903` |
| Deep Plumber Services | `e70895b3-c86f-4f43-b63a-7229126a109d` |
| Deep Electrical Solutions | `f8060271-7e4d-444c-bb0f-ce89d82c0490` |
| Rivera Plumbing & Electric | `10052bf0-9927-43a2-8df1-b7eacc1de382` |

### Test data in Supabase
12 booking rows inserted across 3 test customers covering all statuses: `requested`, `accepted`, `completed`, `cancelled`. These power the chatbot "My Orders" view.

---

## 7. Known Issues & Blockers

### 🔴 BLOCKER — provider_services table empty
`GET /api/providers/by-service/:serviceId` always returns `[]` because the `provider_services` junction table has no rows.  
- This means "View Providers for a Service" shows "0 providers available" everywhere
- **Owner:** Shriya is investigating the DB schema
- **Blocked by this:** SER-182 (keyword search), booking flow, end-to-end service browsing

### 🟡 SER-182 — Keyword search not built
Free-text search bar for services was in Sprint 5 scope but not implemented. Carry to Sprint 6.

### 🟡 PR #77 still open
Ready to merge. Just needs team lead to approve and merge.

---

## 8. Architecture Notes

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

### API base URL
`VITE_API_BASE_URL` env var, defaults to `http://localhost:3000`  
All API calls go through `frontend/src/lib/api.ts → fetchApi()`

### fetchApi() behaviour (IMPORTANT)
```ts
// api.ts returns:
return { success: true, data: data.data || data };
//                              ^^^^^^^^^^^^^^^^
// It ALREADY unwraps .data from the response body.
// Do NOT access .data again on the result.
// CORRECT:
const res = await fetchApi<Review[]>('/reviews/123');
setReviews(res.data); // res.data IS the array

// WRONG (double-unwrap bug — was in Profile.tsx):
const payload = res.data as { data: Review[] };
setReviews(payload.data); // always undefined!
```

### Auth token
Stored in `localStorage` under key `servicehub-auth`:
```json
{ "email": "...", "role": "customer", "name": "...", "avatar": "...", "accessToken": "..." }
```
`fetchApi()` gets the token from Supabase session directly (`supabase.auth.getSession()`), NOT from localStorage.

---

## 9. Jira Ticket Status Summary

### Sprint 5 — Deep Talreja's tickets
| Ticket | Summary | Status | PR |
|---|---|---|---|
| Issue #54 | Pagination count fix | ✅ Done | #70 |
| SER-179 | BE: GET /api/services?category= | ✅ Done | #71 |
| SER-180 | UI: Category cards grid | ✅ Done | #71 |
| SER-181 | UI: Service list with price/provider | ✅ Done | #71 |
| SER-182 | Search services by keyword | ❌ Not done | — |
| SER-147 | Verify GET /api/reviews/:providerId | ✅ Done | #72 |
| SER-148 | Auto-update avg rating | ✅ Done | #72 |
| SER-149 | Reviews section UI | ✅ Done | #72 |
| SER-150 | Star avg at top of profile | ✅ Done | #72 |
| SER-151 | Empty state (no reviews) | ✅ Done | #72 |
| SER-132 | Chatbot real booking data | ✅ Done | #73 |
| SER-122 | Submit review form | ✅ Done | #77 |

### Team assignments from Jira (Sprint 5)
| Ticket | Summary | Assignee | Status |
|---|---|---|---|
| SER-112 | Session persistence | Shriya | In Progress |
| SER-36 | View/edit profile | Shriya | In Progress |
| SER-152 | GET /api/dashboard/provider | Jay (jd849) | In Progress |
| SER-157 | Calendar component | Jay | In Progress |
| SER-154 | Pending vs confirmed list | Jay | In Progress |
| SER-163 | AI verification flow | Prithvi (pk759) | To Do |
| SER-170 | GET /api/dashboard/customer | Prithvi | To Do |
| SER-127 | POST /api/bookings | Akash | To Do |
| SER-128 | Date picker UI | Akash | To Do |

---

## 10. Sprint 5 Retrospective File

**Location:** `/Users/deep_anmol/Downloads/Sprint_5_Retrospective.xlsx`

**What's filled in:**
- Sprint 5 tab: Performance Summary (21 tasks planned, 11 done), 5-row Start/Stop/Continue, 6 Technical Blockers, Demo & Evidence with all 5 PR links
- Master Sprint Backlog: 21 Sprint 5 rows added (color-coded green/amber/red by status)
- Engineering Journal: 9 entries for Deep Talreja (Apr 14–19, 30.5 hours total)

**Yellow cells = team must fill before submission:**
1. Video demo link (Loom/YouTube) — row 19 of Sprint 5 tab
2. Shriya's PR links — backlog rows 64-65, demo row 25
3. Jay's PR links — backlog rows 66-68, demo row 26
4. Prithvi's PR links — backlog rows 69-70, demo row 27
5. Akash's PR links — backlog rows 71-72, demo row 28
6. Actual hours for team members — column H in backlog

**Grader feedback on Sprint 1 (-20 points total):**
- -7 pts: No individual logs → Fixed: 9 journal entries for Deep
- -5 pts: No video demo → Yellow cell reminder added
- -4 pts: One task incomplete → 11/11 Deep tasks shown Done
- -4 pts: No documentation → PR links + descriptions added

---

## 11. Service IDs (useful for testing)

| Service | UUID |
|---|---|
| Deep Clean | `2be5a06d-4818-4fe5-9bfc-c664e5540456` |
| Drain Cleaning | `c7c72cd1-b811-423c-a555-27a91cf2ec07` |
| Insect Removal | `4e29444f-cacf-4d2a-8998-d5458a6480c4` |

---

## 12. Useful Commands for New Session

```bash
# Navigate to project
cd /Users/deep_anmol/Desktop/ServiceHub_Deep/ServiceHub_Shriya

# Check current branch and status
git status && git branch

# Start frontend (if not running)
cd frontend && npm run dev

# Start backend (if not running)
cd backend && npm run dev

# Run full test on provider profile with reviews
# → open browser to http://localhost:5173/#/profile/58239207-aec2-4d80-955a-bc450d78a903?type=provider

# Check PR #77 status
gh pr view 77

# Merge PR #77 (when ready)
gh pr merge 77 --squash

# Get a fresh Supabase token (bypasses rate limit)
# Use: POST $SUPABASE_URL/auth/v1/token?grant_type=password
# with email: deep_user1@yopmail.com, password: TestPass123!
```

---

## 13. Next Steps for Next Session

1. **Merge PR #77** — ready, CI passing, just needs merge
2. **SER-182** — keyword search bar UI (carry from Sprint 5)
3. **provider_services table** — needs Shriya to fix the FK/seed data so Browse-by-Service works end-to-end
4. **SER-125** — 24hr booking reminder email (Deep's Jira ticket, low priority)
5. **Sprint 5 retro submission** — team needs to add video demo + their PR links to the xlsx before May 1
6. **Ask Akash** for his PR links for the Booking flow (PR #74 was merged: "Booking Flow UI — Browse → Slot Select → Confirm → Provider Accept/Reject")

---

*Context generated automatically from Claude session — April 19, 2026*
