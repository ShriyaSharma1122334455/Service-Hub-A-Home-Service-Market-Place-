### 📢 Latest Project Update
> **Change:** fix(auth): JWKS-based token verification — no secrets required (#25)
> **Date:** Mon Mar 23 19:01:53 UTC 2026
---

# 🏠 Service Hub — Marketplace

A multi-service home-services marketplace where **customers** can book vetted professionals (plumbers, electricians, cleaners, pest control) and **providers** can manage bookings, set availability, and build their reputation through reviews.

---

## 🗂️ Architecture in Plain Words

The project is split into **four independent services**, each in its own folder with its own Dockerfile. They talk to each other only through REST HTTP calls — no shared code, no mixed runtimes:

```
┌─────────────────────┐   REST    ┌──────────────────────────────┐
│  frontend/          │ ────────► │  backend/                    │
│  React 19 + Vite    │           │  Express 5 + Node 20         │
│  TypeScript         │           │  Supabase (Postgres + Auth)  │
└─────────────────────┘           └──────────┬───────────────────┘
                                             │ HTTP (internal key)
                              ┌──────────────▼────────────────────┐
                              │  ai-services/                     │
                              │  FastAPI + Python 3.10            │
                              │  Google Vision OCR                │
                              │  AWS Rekognition face match       │
                              │  NSOPW background check           │
                              └───────────────────────────────────┘

                              ┌───────────────────────────────────┐
                              │  visual-damage-assessment/        │
                              │  FastAPI + Python 3.10            │
                              │  Groq (Llama 4) vision model      │
                              └───────────────────────────────────┘
```

---

## 🚀 Quick Start

```bash
npm run setup
npm run dev
```

Or with Docker (starts all services together):

```bash
docker compose up --build
```

---

## 📦 Service-by-Service Explanation

### 1. `backend/` — Express.js API (Node.js)

**What it does:** The main API server. Handles auth, bookings, providers, services, complaints, and profiles.

**Entry point:** [`backend/src/server.js`](backend/src/server.js)

```js
// Every route is registered here with its prefix
app.use('/api/auth',       authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/services',   serviceRoutes);
app.use('/api/providers',  providerRoutes);
app.use('/api/bookings',   bookingRoutes);
app.use('/api/complaints', complaintRoutes);
```

**Authentication — how it works:**

1. User logs in → backend calls `supabase.auth.signInWithPassword()` → gets a JWT token.
2. Token is sent in every request as `Authorization: Bearer <token>`.
3. The `authenticate` middleware (see [`backend/src/middleware/authMiddleware.js`](backend/src/middleware/authMiddleware.js)) calls `supabase.auth.getUser(token)` to validate it and attaches the user to `req.user`.

```js
// Example from authMiddleware.js — validating the JWT
const { data, error } = await adminClient.auth.getUser(token);
if (error || !data?.user) {
  return res.status(401).json({ error: 'Unauthorized' });
}
req.user = { id: data.user.id, email: data.user.email, role: data.user.user_metadata?.role };
return next();
```

**Role-based access control:**

```js
// Only providers can create services — from serviceRoutes.js
router.post('/', authenticate, requireRole('provider'), createService);
// Only customers can create bookings — from bookingRoutes.js
router.post('/', authenticate, requireRole('customer'), createBooking);
```

**Booking lifecycle:** Customer creates → Provider accepts/rejects → Provider marks complete.

```js
// From bookingController.js — accepting a booking
const { data: booking } = await supabase
  .from('bookings')
  .update({ status: 'confirmed' })
  .eq('id', req.params.id)
  .select()
  .single();
```

---

### 2. `frontend/` — React + TypeScript SPA

**What it does:** The customer-facing web app. Displays service categories, lets users browse providers, and book services.

**Entry point:** [`frontend/src/App.tsx`](frontend/src/App.tsx)

**How the home page loads categories from the API:**

```ts
// From frontend/src/pages/Home.tsx
useEffect(() => {
  fetch(`${API_BASE}/api/categories`)
    .then(res => res.json())
    .then(data => { if (data.success) setCategories(data.data); });
}, [API_BASE]);
```

**Pages:**
| Page | File | What it does |
|------|------|-------------|
| Home | [`pages/Home.tsx`](frontend/src/pages/Home.tsx) | Category grid, entry point |
| Login | [`pages/Login.tsx`](frontend/src/pages/Login.tsx) | Supabase auth sign-in |
| Register | [`pages/Register.tsx`](frontend/src/pages/Register.tsx) | New customer/provider signup |
| Provider Dashboard | [`pages/ProviderDashboard.tsx`](frontend/src/pages/ProviderDashboard.tsx) | Manage incoming bookings |
| Service Providers | [`pages/ServiceProviders.tsx`](frontend/src/pages/ServiceProviders.tsx) | Browse & book providers |
| Profile | [`pages/Profile.tsx`](frontend/src/pages/Profile.tsx) | View/edit own profile |

---

### 3. `ai-services/` — Verification Service (Python / FastAPI)

**What it does:** Provider identity verification pipeline. Called by the Express backend (not directly by the browser).

**Entry point:** [`ai-services/app/main.py`](ai-services/app/main.py)

**Three verification steps for a new provider:**

| Step | Endpoint | What happens |
|------|----------|-------------|
| 1. ID OCR | `POST /api/v1/verify/document` | Google Cloud Vision reads text from the uploaded ID photo |
| 2. Face match | `POST /api/v1/verify/face` | AWS Rekognition compares a selfie to the ID photo (80 % threshold) |
| 3. Background | `POST /api/v1/verify/nsopw` | Checks provider's name against the NSOPW sex-offender registry |

**Example — face match logic** (from [`ai-services/app/services/face_service.py`](ai-services/app/services/face_service.py)):

```python
response = client.compare_faces(
    SourceImage={"Bytes": id_bytes},     # face from the ID
    TargetImage={"Bytes": selfie_bytes}, # live selfie
    SimilarityThreshold=0.0,             # we apply our own threshold
)
best  = max(face_matches, key=lambda m: m["Similarity"])
score = round(best["Similarity"], 2)
match = score >= settings.FACE_MATCH_THRESHOLD   # default: 80 %
```

**Security:** Every route requires an `X-Internal-Key` header. Only the Express backend knows this key, so the browser can never call the AI service directly.

```python
# From ai-services/app/routes/verification.py
def verify_internal_key(x_internal_key: Optional[str] = Header(None)):
    if x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")
```

---

### 4. `visual-damage-assessment/` — Damage Assessment Service (Python / FastAPI)

**What it does:** Accepts an image + a user goal (e.g. "Can I repaint this wall?"), sends it to the Groq Llama 4 vision model, and returns a JSON assessment with cost estimate.

**Entry point:** [`visual-damage-assessment/main.py`](visual-damage-assessment/main.py)

**API endpoint:** `POST /assess` — accepts an image file and a `task` text field.

---

## 🔑 Lesson Learned: Multi-Runtime Integration

### The Failed Approach

Early in the project, the team attempted to call Python AI logic **directly** from the Node.js process — mixing runtimes in a single service boundary. This created:
- Dependency conflicts (Python vs. Node package managers fighting each other)
- CI pipeline instability (different runtimes needed different system libraries)
- No clear ownership of failures between frontend/backend/AI team members

### The Resolution

The team adopted a **"one runtime per service"** architecture:

| Layer | Runtime | Language |
|-------|---------|----------|
| Frontend | Browser / Vite | TypeScript |
| Backend API | Node.js 20 | JavaScript (ESM) |
| AI/Verification | Python 3.10 | Python |
| Damage Assessment | Python 3.10 | Python |

Services communicate only via **HTTP REST**. The Express backend calls the Python FastAPI services with a shared internal API key. This means:
- Each service can be deployed, tested, and scaled independently
- A Python bug can't crash the Node.js API
- Each team member works in their own language/toolchain

This is reflected in the project structure: each service has its own `Dockerfile`, `requirements.txt` or `package.json`, and CI job in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## 🗄️ Database

All persistent data lives in **Supabase** (managed Postgres):
- `users` — customer and provider accounts (synced from Supabase Auth via trigger)
- `providers` — provider profile, rating, verification status
- `services` — service catalogue per category
- `bookings` — booking lifecycle (`pending → confirmed → completed`)
- `availability` — provider time slots
- `reviews` — post-booking ratings

---

## 🧪 Running Tests

**Backend (Jest):**
```bash
cd backend
npm test
```

**AI Services (pytest):**
```bash
cd ai-services
pytest
```

---

*Last updated via GitHub Actions [skip ci]*

# 🏠 Service Hub — Marketplace

## 📢 Latest Update
> **Last Change:** Revise README for clarity and project details
> **Updated On:** Mon Mar  9 19:30:54 UTC 2026

---

## 🚀 Quick Start
```bash
npm run setup
npm run dev
```

---
*Last updated via GitHub Actions [skip ci]*
