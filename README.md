# Service Hub — A Home Service Marketplace
#TEST1

## Short description

Service Hub is a full-stack home-services marketplace that connects users with service providers (cleaning, repairs, visual damage assessment, and more). This repository contains the backend API, frontend web client, and an auxiliary visual-damage-assessment service.

## Repository layout

- `backend/` — Node.js API, models, routes, controllers, tests, and seed scripts.
- `frontend/` — React + TypeScript web client (Vite).
- `visual-damage-assessment/` — Python service for image-based damage analysis.

## Current status — Sprint 2

This project is currently in Sprint 2. See `SPRINT2_PROGRESS.md` for sprint goals, completed stories, and remaining tasks.

## Prerequisites

- Node.js (v16+ recommended)
- npm or yarn
- MongoDB (local or Atlas)
- Docker & Docker Compose (optional)
- Python 3.8+ for `visual-damage-assessment/` (if using that module)

## Quick start (local)

1. Backend

```bash
cd backend
npm install
# create a .env with your credentials (MONGODB_URI, JWT_SECRET, CLOUDINARY_* etc.)
# seed data (optional)
npm run dev
```

Seed sample data (examples)

```bash
cd backend
# run seed scripts (paths under src/scripts)
node src/scripts/seedCategories.js
node src/scripts/seedProviders.js
node src/scripts/seedUsers.js
```

2. Frontend

```bash
cd frontend
npm install
npm run dev
# open the URL Vite reports (usually http://localhost:5173)
```

3. Docker (all services)

```bash
docker-compose up --build
```

## Tests

Backend tests are located under `backend/src/tests`. From the `backend/` directory run:

```bash
npm test
```

## Documentation & useful files

- API docs: `backend/API_DOCUMENTATION.md`
- Server entry: `backend/src/server.js`
- Routes: `backend/src/routes/`
- Seed scripts: `backend/src/scripts/`
- Sprint notes: `SPRINT1_PROGRESS.md`, `SPRINT2_PROGRESS.md`

## Contributing

- Create issues for bugs or feature requests.
- Follow the Sprint notes in `SPRINT2_PROGRESS.md` when implementing tasks.

## Next recommended steps

- Add a sample `backend/.env.example` showing required environment variables.
- Add a short `frontend/README.md` with local dev notes and port/proxy details.
- Add CI to run tests & lint on push/PR.

## Contact

If you want edits or additional details (examples, environment variables, or CI), tell me which section to expand.
