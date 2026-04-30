# ServiceHub — Claude Quick-Start Memory

> Read `CLAUDE_CONTEXT.md` in the project root for the full handoff document.  
> This file is the fast-load summary for Claude on session start.

## Who am I working with?
**Deep Talreja** — Full-Stack Dev, NJIT, dt443@njit.edu  
Team: Shriya Sharma (lead), Akash Deore, Jaysheel Dodia (jd849), Pruthvi Kadam (pk759)

## Current sprint: Sprint 5 — deadline May 1 2026
Deep owns: Service Catalog (SER-113 subtasks) + Review & Rating (SER-122/123) + Chatbot (SER-132)

## PR Status (as of Apr 19 2026)
| PR | Status | Description |
|---|---|---|
| #70 | ✅ Merged | Pagination count fix |
| #71 | ✅ Merged | Service catalog by category |
| #72 | ✅ Merged | Provider reviews UI |
| #73 | ✅ Merged | Chatbot real booking data |
| **#77** | 🟡 **OPEN — MERGE ME** | Review form + double-unwrap bugfix + route typo fix |

## CRITICAL BUG — already fixed, don't re-introduce
`fetchApi()` in `frontend/src/lib/api.ts` already unwraps `.data` from the response.  
**Never** access `.data` again on the result. `res.data` IS the payload directly.

## Known blocker
`provider_services` junction table has ZERO rows → Browse-by-Service always returns empty.  
Owner: Shriya. Do not waste time debugging this — it's a data/schema issue, not code.

## Test accounts
- Customer: `deep_user1@yopmail.com` / `TestPass123!`
- Provider: `deep_plumber@yopmail.com` / `TestPass123!`

## Key provider UUIDs
- Deep Clean Pro: `58239207-aec2-4d80-955a-bc450d78a903`
- Deep Plumber Services: `e70895b3-c86f-4f43-b63a-7229126a109d`

## Sprint 5 Retro
File: `/Users/deep_anmol/Downloads/Sprint_5_Retrospective.xlsx`  
Deep's 9 journal entries + 11 Done tasks filled in.  
Team still needs to add: video demo link + their own PR links (yellow cells).

## Immediate next actions
1. Merge PR #77 (`gh pr merge 77 --squash`)
2. Ask team to add PR links + video demo to retro xlsx before May 1
3. SER-182 keyword search (carry from Sprint 5)
4. SER-125 24hr reminder email (after booking UI ships)
