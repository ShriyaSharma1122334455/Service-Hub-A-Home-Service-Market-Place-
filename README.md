# ServiceHub 🏠

### _The AI-First Home Services Marketplace_

> Connecting verified professionals with homeowners — powered by computer vision, identity AI, and intelligent automation.

---

## 1. The Idea

ServiceHub is a two-sided marketplace that makes hiring a home service professional as trustworthy as it is convenient.

On one side, homeowners who need plumbing, electrical, cleaning, or pest control services can find verified professionals, get AI-powered damage assessments from a photo, and book in minutes. On the other side, service providers get a platform that validates their credentials, manages their bookings, and helps them build a credible digital presence.

The core bet is simple: **trust is the product**. Not the booking interface. Not the search bar. Trust — and AI is how we deliver it at scale without a human reviewer touching every single registration.

Every provider on ServiceHub is verified by machine before a single customer ever sees their profile. Every homeowner can upload a photo of a broken pipe or exposed wire and get an instant, intelligent recommendation — before they even know what category of service they need.

This is not a directory. This is not a lead generation tool. ServiceHub is an end-to-end platform where the entire journey — from "I have a problem" to "the professional showed up and got paid" — happens in one place, with AI woven into every critical decision point.

---

## 2. The Problem & How We Solve It

### The Market Problem

The home services industry in the US is a **$600B+ market** with a trust problem at its core.

**For homeowners:**

- Existing platforms (Thumbtack, TaskRabbit, Angi) allow providers to self-register with minimal verification
- There is no standard way to assess home damage before booking — you either call someone to diagnose, or guess
- Payment, communication, and reviews are often fragmented across different tools
- No mutual accountability — the homeowner has no way to verify who is showing up at their door

**For service providers:**

- No unified platform to showcase verified credentials alongside bookings
- Competing on price alone because there is no trust differentiation
- Manual, phone-based booking management
- No structured way to build a digital reputation

### How ServiceHub Solves It

| Problem                 | ServiceHub Solution                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Unverified providers    | AI-powered multi-step verification — ID OCR, face matching, NSOPW background check    |
| No damage assessment    | Computer vision damage analysis — upload a photo, get a service recommendation        |
| Fragmented experience   | End-to-end platform — browse, book, pay, review in one place                          |
| No mutual trust         | Both providers AND customers go through identity verification                         |
| Manual booking          | Auto-confirmed bookings with real-time availability and instant Stripe payments       |
| No intelligent guidance | AI FAQ chatbot built on RAG — answers questions about services, pricing, and policies |

---

## 3. The Team

Built by a team of 5 engineers at NJIT for the Computer Science Capstone Program, Spring 2026.

| Name         | Role            | What They Own                                                                     |
| ------------ | --------------- | --------------------------------------------------------------------------------- |
| **Shriya**   | Frontend Lead   | Authentication flows, user and provider profiles, dashboard UI, responsive design |
| **Akash**    | Backend Lead    | Booking system, REST APIs, email notifications, service catalog                   |
| **Deep**     | Full Stack + AI | Reviews, complaints, FAQ chatbot (RAG pipeline + AnythingLLM + Ollama)            |
| **Jaysheel** | AI Engineer     | Visual damage assessment, computer vision integration, Stripe payment system      |
| **Pruthvi**  | AI Engineer     | Identity verification pipeline — ID OCR, face matching, NSOPW background check    |

---

## 4. System Design

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                   CLIENT LAYER                       │
│           React + TypeScript (Vite)                  │
│                 Hosted on Vercel                     │
│  CDN-cached static assets — sub-50ms global load    │
└────────────────────────┬────────────────────────────┘
                         │ HTTPS
            ┌────────────┼────────────┐
            ▼            ▼            ▼
     ┌────────────┐ ┌──────────┐ ┌──────────────┐
     │  SUPABASE  │ │ EXPRESS  │ │   SUPABASE   │
     │    AUTH    │ │   API    │ │   STORAGE    │
     │            │ │          │ │              │
     │ Google     │ │ REST     │ │ ID documents │
     │ OAuth      │ │ JWT auth │ │ Selfies      │
     │ Email/Pass │ │ RLS      │ │ Avatars      │
     │ Auto email │ │ Rate     │ │ Private      │
     │ verify     │ │ limiting │ │ buckets      │
     └────────────┘ └────┬─────┘ └──────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │    SUPABASE DB      │
              │    (PostgreSQL)     │
              │                    │
              │  Row Level Security │
              │  on every table    │
              │                    │
              │  Auto triggers:    │
              │  - User creation   │
              │  - Provider setup  │
              │  - Complaint refs  │
              │  - Timestamp sync  │
              └──────────┬─────────┘
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
   ┌─────────────────┐     ┌──────────────────────┐
   │  AI SERVICE 1   │     │    AI SERVICE 2       │
   │   (FastAPI)     │     │    (FastAPI)          │
   │                 │     │                       │
   │  ID OCR         │     │  Damage Assessment    │
   │  Face Matching  │     │  Computer Vision      │
   │  NSOPW Check    │     │  Service Mapping      │
   └─────────────────┘     └──────────────────────┘
                                      │
                                      ▼
                           ┌──────────────────────┐
                           │   CHATBOT SERVICE    │
                           │                      │
                           │  AnythingLLM         │
                           │  Ollama (local LLM)  │
                           │  RAG Pipeline        │
                           │  Knowledge Base      │
                           └──────────────────────┘

         EXTERNAL SERVICES
    ┌──────────┐ ┌────────┐ ┌─────────┐
    │  STRIPE  │ │ RESEND │ │ LEAFLET │
    │ Payments │ │ Email  │ │  Maps   │
    └──────────┘ └────────┘ └─────────┘
```

### How We Handle Performance & Reliability

**Latency**

- Supabase PostgreSQL is deployed in the same region as the Express API — database queries stay sub-10ms for standard operations
- Supabase Auth JWT verification happens at the database level via Row Level Security — no extra network hop to validate tokens on read operations
- Static frontend assets served from Vercel's global CDN — first paint under 1s from anywhere in the US
- AI microservices are stateless FastAPI instances — each request is independent, no shared state bottlenecks

**Security**

- Row Level Security enforced at the database level — even if the API has a bug, a user cannot read another user's data because Postgres itself blocks it
- Service role key (which bypasses RLS) is never exposed to the frontend — only the anon key is client-facing
- Rate limiting on auth routes — 10 login attempts per 15 minutes before lockout
- All file uploads go to private Supabase Storage buckets — ID documents and selfies are never publicly accessible

**Resilience**

- NSOPW background check has an automatic fallback to self-declaration if the external registry is unreachable
- AI verification failures fall back to manual review queues — the system never hard-blocks a provider due to a third-party API outage
- Frontend retries profile fetch up to 3 times with 500ms intervals to handle database trigger propagation timing
- All unhandled promise rejections crash the process intentionally — fail fast, restart clean via nodemon/PM2

**Database Design for Scale**

- Indexes on all high-frequency lookup columns: `supabase_id`, `email`, `provider_id + status`, `customer_id + status`, `scheduled_at`
- `is_fully_verified` on providers is a Postgres generated column — computed once on write, never on read
- Complaint reference IDs (`COMP-XXXX`) generated by a database trigger — no application-level round trips
- `updated_at` maintained by triggers on all tables — consistent without any ORM overhead

---

## 5. Tech Stack

### Why These Choices

| Layer             | Technology            | Why                                                                       |
| ----------------- | --------------------- | ------------------------------------------------------------------------- |
| Frontend          | React + TypeScript    | Type-safe component architecture, large ecosystem                         |
| UI Components     | ShadCN UI             | Accessible, unstyled primitives with full design control                  |
| Build Tool        | Vite                  | Fastest dev server and build times in the ecosystem                       |
| Backend           | Node.js + Express     | Non-blocking I/O ideal for a booking platform with concurrent requests    |
| Database          | Supabase (PostgreSQL) | Relational data, RLS security, Auth + Storage + Realtime in one platform  |
| Authentication    | Supabase Auth         | Native JWT integration with the DB — eliminates the sync problem entirely |
| File Storage      | Supabase Storage      | Private buckets with RLS — same security model as the database            |
| AI Services       | Python + FastAPI      | Async-native, ideal for ML workloads, fastest Python API framework        |
| Chatbot LLM       | Ollama (local)        | Zero API cost, data never leaves the server, Llama/Mistral quality        |
| Chatbot Framework | AnythingLLM           | Production-ready RAG pipeline with knowledge base management              |
| Payments          | Stripe                | Industry standard, PCI compliant, sandbox testing built in                |
| Email             | Resend                | Modern transactional email with excellent deliverability                  |
| Maps              | Leaflet               | Open source, no API costs, full customization                             |
| Hosting           | Vercel (frontend)     | Zero-config deployment, global CDN, preview URLs per PR                   |

### AI/ML Stack in Detail

```
Identity Verification Pipeline:
  Google Document AI / AWS Textract  →  ID OCR extraction
  AWS Rekognition / Google Vision    →  Face matching (80% threshold)
  NSOPW web scraping                 →  Background check

Damage Assessment Pipeline:
  Google Vision / AWS Rekognition    →  Image label detection
  Custom label mapping               →  Service category recommendation

FAQ Chatbot Pipeline:
  Knowledge base documents           →  Ingested into AnythingLLM
  User question                      →  Semantic search for relevant context
  Context + question                 →  Sent to Ollama (Llama/Mistral)
  Generated answer                   →  Returned to user
```

---

## 6. Application Flow

### Customer Journey

```
Register / Login
      ↓
Identity Verification (ID upload + selfie)
      ↓
Browse Service Catalog
  → Search by category, price, location
  → OR upload a photo → AI damage assessment → recommended category
      ↓
View Provider Profiles
  → Ratings, reviews, verification badge, availability
      ↓
Select Time Slot → Book
      ↓
Stripe Payment → Booking Confirmed
      ↓
Email Confirmation (via Resend)
      ↓
Service Completed
      ↓
Rate & Review Provider
```

### Provider Journey

```
Register
      ↓
Multi-Step AI Verification
  → Upload ID → OCR extraction
  → Capture selfie → Face match
  → NSOPW background check
  → Self-declaration
      ↓
Set Up Profile
  → Business name, description, services offered, custom pricing
      ↓
Set Availability Calendar
      ↓
Receive Booking Requests → Accept / Reject
      ↓
Complete Job → Get Paid → Receive Review
```

### How to Run Locally

**1. Clone the repository**

```bash
git clone https://github.com/your-org/service-hub.git
cd service-hub
```

**2. Database setup**

Create a free Supabase project at supabase.com, then run in SQL Editor:

```
backend/database/schema.sql
```

This creates all tables, RLS policies, triggers, and seeds the service catalog.

**3. Backend**

```bash
cd backend
npm install
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE keys
npm run dev
# Runs on http://localhost:3000
```

**4. Frontend**

```bash
cd frontend
npm install
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL
npm run dev
# Runs on http://localhost:5173
```

**5. AI Verification Service**

```bash
cd app
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**6. Damage Assessment Service**

```bash
cd visual-damage-assessment
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

### Environment Variables

**Backend (`backend/.env`)**

```env
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

RESEND_API_KEY=re_...
FROM_EMAIL=onboarding@resend.dev
FROM_NAME=ServiceHub
```

**Frontend (`frontend/.env`)**

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=http://localhost:3000
```

---

## 7. Target Audience & What Makes Us Different

### Who This Is For

**Primary — Homeowners & Renters (25–55, US)**
People who own or rent homes and need occasional or regular professional services. They value reliability over price — they've been burned before by an unreliable contractor and they want to know who is showing up at their door.

**Secondary — Independent Service Professionals**
Licensed and independent plumbers, electricians, cleaners, and pest control specialists who want to build a credible online presence and get more customers without depending on word of mouth alone.

### The Competitive Landscape

| Platform       | Verification             | AI Features                | Mutual Trust  | End-to-End      |
| -------------- | ------------------------ | -------------------------- | ------------- | --------------- |
| Thumbtack      | ❌ Self-reported         | ❌                         | ❌            | ❌              |
| TaskRabbit     | ⚠️ Basic background      | ❌                         | ❌            | ⚠️              |
| Angi           | ⚠️ License check         | ❌                         | ❌            | ⚠️              |
| **ServiceHub** | ✅ AI-powered multi-step | ✅ Damage assess + chatbot | ✅ Both sides | ✅ Full journey |

### What Makes ServiceHub Stand Out

**1. AI is not a feature — it is the foundation**
Every other platform treats AI as a nice-to-have. We built the trust layer entirely on AI. Verification, damage assessment, and intelligent guidance are not add-ons. They are how the platform works.

**2. Mutual verification**
We verify both sides. Not just providers. A homeowner on ServiceHub has also confirmed their identity — which means providers know they're dealing with a real, accountable person. No other mainstream platform does this.

**3. Damage assessment before booking**
No other home services platform helps the customer figure out what they actually need before they book. We do. Upload a photo, get a recommendation. This reduces wrong bookings, increases satisfaction, and makes the platform genuinely useful even before a booking happens.

**4. Privacy-first AI**
Our FAQ chatbot runs entirely locally via Ollama — no user conversations are sent to OpenAI or any external API. For a platform handling sensitive home and identity information, this is a meaningful trust signal.

**5. One platform, zero fragmentation**
Browse, verify, book, pay, review — everything in one place. No external payment links, no WhatsApp conversations to close the deal, no separate review platforms.

---

## Service Categories

| Category        | What's Covered                                                        |
| --------------- | --------------------------------------------------------------------- |
| 🔧 Plumbing     | Leak repair, drain cleaning, pipe installation, water heater service  |
| ⚡ Electrical   | Outlet installation, panel upgrades, wiring repair, lighting fixtures |
| 🧹 Cleaning     | Deep cleaning, move in/out cleaning, regular maintenance              |
| 🐛 Pest Control | Insect removal, rodent control, prevention treatments                 |

---

_ServiceHub — Trust is the product. AI is how we deliver it._
