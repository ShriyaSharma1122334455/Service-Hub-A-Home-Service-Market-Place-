# ServiceHub — Claude Session Context & Handoff

> **Last updated:** April 30, 2026 (Session 2)
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
| Auth | Supabase JWT |
| CI/CD | GitHub Actions |

### Repo
```
https://github.com/ShriyaSharma1122334455/Service-Hub-A-Home-Service-Market-Place-
```

### Local paths
```
Project root:   /Users/deep_anmol/Desktop/ServiceHub_Deep/ServiceHub_Shriya/
Frontend:       .../frontend/src/
Backend:        .../backend/src/
Frontend URL:   http://localhost:5173
Backend URL:    http://localhost:3000
```

---

## 2. Current Sprint: Final Week — Sprint 6 (Deadline May 1, 2026)

This is the LAST sprint. All features must be completed, tested, and submitted.

---

## 3. All PRs by Deep Talreja (full history)

| PR | Branch | Status | Description |
|---|---|---|---|
| #70 | `fix/issue-54-pagination-count` | ✅ Merged | Pagination count fix |
| #71 | `feat/ser-113-service-provider-info` | ✅ Merged | Service catalog category cards |
| #72 | `feat/ser-123-provider-reviews` | ✅ Merged | Reviews section on provider profile |
| #73 | `feat/ser-132-chatbot-real-bookings` | ✅ Merged | Chatbot real booking data |
| #77 | `feat/ser-122-submit-review` | ✅ Merged | Submit review form + bugfixes |
| **—** | `feat/ser-125-booking-reminder` | 🟡 **Open — needs PR** | 24hr reminder email (SER-125) |
| **—** | `feat/ser-83-82-reviews-pagination` | 🟡 **Open — needs PR** | Pagination + service reviews (SER-83, SER-82) |

---

## 4. Latest main branch state (as of Apr 30, 2026)

Most recent PRs merged to main (newest first): #91, #90, #89, #87, #86, #83, #77, #74, #73, #72, #71, #70

Main is at commit `b2df9da` (PR #91 — customer details in booking responses).

---

## 5. Jira Task Status — Deep Talreja

### ✅ COMPLETED
SER-12, SER-20, SER-34, SER-38, SER-60, SER-61, SER-66, SER-79, SER-80, SER-81, SER-122, SER-123, SER-132, SER-147, SER-148, SER-149, SER-150, SER-151, SER-179, SER-180, SER-181

### ✅ DONE THIS SESSION (Apr 30)
| Ticket | Summary | Branch |
|---|---|---|
| SER-125 | 24hr booking reminder email | `feat/ser-125-booking-reminder` |
| SER-83 | Pagination for reviews | `feat/ser-83-82-reviews-pagination` |
| SER-82 | Fetch reviews by service | `feat/ser-83-82-reviews-pagination` |

### ⚠️ JIRA STATUS WRONG — update in Jira
| Ticket | Jira Says | Actual |
|---|---|---|
| SER-39 | In Progress | ✅ Done — code in PR #72 |

### ❌ SKIPPED / NOT APPLICABLE
- SER-182: Assigned to Akash, he is doing it
- SER-167/168/169: Subtasks of SER-125, now done via the cron implementation

---

## 6. What Was Built This Session (Apr 30)

### SER-125: 24hr Booking Reminder Email

**Files changed:**
- `backend/src/services/emailService.js` — `sendBookingReminderEmail()` added
- `backend/src/services/reminderService.js` — **NEW**: cron query + email dispatch
- `backend/src/server.js` — `startReminderCron()` called on boot
- `backend/src/routes/testRoutes.js` — two test endpoints added
- `backend/package.json` — `node-cron` dependency added

**How it works:**
- Cron runs every 15 minutes via `node-cron`
- Queries `bookings` where `status = 'confirmed'` AND `scheduled_at` is between `NOW + 23.5hr` and `NOW + 24.5hr`
- Sends branded HTML email via Resend
- In-memory Set prevents duplicate sends within the same server session

**Email details:**
- Service: **Resend** (`resend.com`)
- FROM: `ServiceHub <onboarding@resend.dev>` (configured in `backend/.env`)
- TO: the customer's email from the bookings table
- RESEND_API_KEY is already set in `backend/.env`

**Test endpoints (dev only):**
```bash
# Trigger the cron check manually (uses current time window)
curl -X POST http://localhost:3000/api/test/trigger-reminders

# Force-send for a specific booking ID (ignores time window)
curl -X POST http://localhost:3000/api/test/send-reminder/<bookingId>
```

### SER-83: Pagination for Reviews

**Files changed:**
- `backend/src/controllers/reviewController.js` — `getProviderReviews` now accepts `?page=&limit=`
- `frontend/src/pages/Profile.tsx` — Prev/Next pagination UI, page state, total count
- `backend/src/scripts/seedReviews.js` — **NEW**: seeds 15 reviews for Deep Clean Pro

**API change:**
```
GET /api/reviews/:providerId?page=1&limit=5
Response: { success, data: { reviews: [...], count: 15, totalPages: 3, page: 1 } }
```

**Seed data inserted:** 15 completed bookings + 15 reviews for Deep Clean Pro  
Provider avg updated to **4.31★** (16 total reviews including 1 pre-existing)

### SER-82: Fetch Reviews by Service

**Files changed:**
- `backend/src/controllers/reviewController.js` — `getServiceReviews()` added
- `backend/src/routes/reviewRoutes.js` — `GET /api/reviews/service/:serviceId` added
- `frontend/src/pages/ServiceProviders.tsx` — "What customers say" section added

**API:**
```
GET /api/reviews/service/:serviceId?limit=10
Response: { success, data: { reviews: [...], count: N, avgRating: 4.3 } }
```

---

## 7. Test Accounts

| Email | Password | Role |
|---|---|---|
| `deep_user1@yopmail.com` | `TestPass123!` | Customer |
| `deep_plumber@yopmail.com` | `TestPass123!` | Provider |

### Key UUIDs
| Entity | UUID |
|---|---|
| Deep Clean Pro (provider) | `58239207-aec2-4d80-955a-bc450d78a903` |
| Deep Plumber Services (provider) | `e70895b3-c86f-4f43-b63a-7229126a109d` |
| Drain Cleaning (service) | `c7c72cd1-b811-423c-a555-27a91cf2ec07` |
| Deep Clean (service) | `2be5a06d-4818-4fe5-9bfc-c664e5540456` |
| Insect Removal (service) | `4e29444f-cacf-4d2a-8998-d5458a6480c4` |

---

## 8. Critical Architecture Notes

### fetchApi() behaviour — DO NOT get this wrong
```ts
return { success: true, data: data.data || data };
// fetchApi ALREADY unwraps .data from the response body.
// For paginated reviews, backend returns { success, data: { reviews, totalPages, ... } }
// → fetchApi returns { success, data: { reviews, totalPages, ... } }
// Access: res.data.reviews, res.data.totalPages
```

### Routing (hash-based)
- `/#/book/:serviceId` — ServiceProviders page (now shows service reviews at bottom)
- `/#/profile/:id?type=provider` — Provider profile (now has pagination)

### bookingController now blocks unverified providers
As of PR #89+, `POST /api/bookings` returns 403 if `provider.verification_status !== 'verified'`.  
Seed scripts bypass this (they write directly to Supabase, not through the API).

### Cron not running in `NODE_ENV=test`
`startReminderCron()` and `checkSupabaseConnection()` are both gated by `process.env.NODE_ENV !== 'test'`.

---

## 9. Next Steps for Next Session

1. **Open PR for `feat/ser-125-booking-reminder`** — ready to merge
2. **Open PR for `feat/ser-83-82-reviews-pagination`** — ready to merge
3. **Update Jira**: mark SER-39 as Done
4. **Smoke test**: run both servers, go through the feature checklist in LOCAL_RUN_GUIDE.txt
5. **Email test**: restart backend, then `curl -X POST http://localhost:3000/api/test/send-reminder/<any-bookingId-from-DB>`

---

## 10. Useful Commands

```bash
cd /Users/deep_anmol/Desktop/ServiceHub_Deep/ServiceHub_Shriya

# Start backend (new terminal)
cd backend && npm run dev

# Start frontend (new terminal)
cd frontend && npm run dev

# Seed reviews (15 reviews for Deep Clean Pro — only run once)
cd backend && npm run seed:reviews

# Test reminder email — force-send for a specific booking
curl -X POST http://localhost:3000/api/test/send-reminder/<bookingId>

# Test reminder cron window manually
curl -X POST http://localhost:3000/api/test/trigger-reminders

# Test paginated reviews API
curl "http://localhost:3000/api/reviews/58239207-aec2-4d80-955a-bc450d78a903?page=1&limit=5"

# Test service reviews API
curl "http://localhost:3000/api/reviews/service/c7c72cd1-b811-423c-a555-27a91cf2ec07"
```

---

*Context last updated April 30, 2026 — SER-125, SER-83, SER-82 implemented and pushed.*
