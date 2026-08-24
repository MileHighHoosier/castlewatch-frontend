# CastleWatch 2027 Frontend

CastleWatch is a mobile-first, private-family Walt Disney World planning and trip-operations application for the October 9-16, 2027 trip.

This repository contains the **Next.js frontend deployed on Vercel**. The companion backend is [`MileHighHoosier/castlewatch-2027`](https://github.com/MileHighHoosier/castlewatch-2027), which runs Flask on Railway with Railway PostgreSQL.

CastleWatch is an unofficial personal planning tool and is not affiliated with, endorsed by, or sponsored by Disney.

## Current architecture

```text
iPhone / browser
      |
      v
Vercel - Next.js frontend (this repo)
      |
      | HTTPS JSON APIs / Next.js proxy routes
      v
Railway - Flask backend
MileHighHoosier/castlewatch-2027
      |
      v
Railway PostgreSQL
```

## Current capabilities

The frontend is well beyond its original Phase One starter state. Major implemented areas include:

- four-park live dashboard,
- current ride waits and park/area pressure views,
- Live Plan recommendation modes,
- shows, activities and character layers,
- emergency break/leave-park support,
- weather-aware planning,
- manual Lightning Lane window tracking,
- Trip Week planner for October 2027,
- editable overnight resorts,
- Getting There transportation/leave-by guidance,
- reservation entry/conflict awareness,
- historical crowd/date signals,
- special-event/calendar intelligence presentation,
- base-vs-alternate Trip Week decision engine,
- user-approved scenario apply/undo/lock behavior,
- shared family plan synchronization,
- shared version history and restore,
- operations/usage support,
- account/device invitation, naming and revocation foundations.

## Current development phase

CastleWatch is in **Rebaseline & Stabilization**, not a new feature sprint.

The current goal is to establish authoritative documentation, resolve high-priority security/reliability issues, improve regression coverage, and finish or deliberately freeze the incomplete account/device migration before adding major new product features.

Rebaseline Sections 4A-4E are complete. Section 4F is the active full regression/build review and Section 4 closeout batch; it does not start the account/device migration work in Section 5.

After stabilization, the next major product objective is to **complete Trip Week Phase 2 - Unified Recommendation Engine**. The engine already exists in partial form; it should not be restarted from scratch.

## Canonical project documentation

The backend repository contains the cross-repository source-of-truth documents:

- [`PROJECT_STATE.md`](https://github.com/MileHighHoosier/castlewatch-2027/blob/main/PROJECT_STATE.md) - current implementation state, known gaps and exact priorities.
- [`ARCHITECTURE.md`](https://github.com/MileHighHoosier/castlewatch-2027/blob/main/ARCHITECTURE.md) - production boundaries, data flows and migration constraints.
- [`ROADMAP.md`](https://github.com/MileHighHoosier/castlewatch-2027/blob/main/ROADMAP.md) - rebaseline/stabilization sequence and later product phases.
- [`AGENTS.md`](AGENTS.md) - instructions for coding agents working in this frontend repository.

## Frontend entry points

The application begins at:

```text
app/page.tsx
  -> app/components/DashboardShell.tsx
```

Primary areas include:

- `app/components/ParkCommandCenter.tsx` - live park dashboard and planning experience.
- `app/components/TripWeekPlanner.tsx` - trip-week presentation and scenario controls.
- `app/components/TripWeekDecisionPanel.tsx` - assembles browser-local decision inputs.
- `app/lib/tripDecisionEngine.ts` - base-vs-alternate Trip Week scoring/recommendation.
- `app/components/TransportationPlanner.tsx` - Getting There routes and leave-by guidance.
- `app/lib/tripProfile.ts` - trip profile, reservations and reservation transportation calculations.
- `app/lib/familyTripSync.ts` - browser/shared trip synchronization.
- `app/lib/familyTripDevices.ts` - device credential and invitation models.
- `app/api/castlewatch-family-sync/route.ts` - protected family-operation proxy to Railway.

## Local development

Install dependencies:

```bash
npm ci
```

Run locally:

```bash
npm run dev
```

Build production frontend:

```bash
npm run build
```

Run automated frontend tests:

```bash
npm test
```

After a successful production build, run the dependency-free mobile Chrome smoke:

```bash
npm run test:e2e
```

GitHub Actions runs the clean Node 22 `npm ci`, full contract suite, production build, and mobile browser smoke together for every pull request.

## Backend connection

The frontend currently resolves its Railway backend URL from the existing environment-variable compatibility path, primarily:

```text
NEXT_PUBLIC_API_BASE_URL
```

See `.env.example` and the current source before changing environment-variable behavior.

Do not put database URLs, family keys, device tokens or invite tokens into committed frontend environment files.

## Shared family access warning

CastleWatch's Accounts / Invitations / Device Management migration is **not complete**.

- `CASTLEWATCH_FAMILY_KEY` must remain available for current shared-plan/recovery behavior.
- A device token must not be assumed to replace the family key for all shared-plan actions.
- Do not add or enable legacy-family-key retirement until owner-device, dual-authorization, revocation/recovery and production-verification gates are satisfied and explicitly approved.

See the backend `PROJECT_STATE.md`, `ARCHITECTURE.md`, and account/device design documents for the current migration state.

## Forecast interpretation

CastleWatch's current future-date crowd signals are based on historical observations and same-weekday/time-of-day evidence. They are useful directional planning inputs, but they are **not precise 2027 crowd forecasts**. Prediction Phase 2 remains future work.

## Deployment

- Frontend: Vercel.
- Backend: Railway.
- Database: Railway PostgreSQL.

A successful deployment only proves that the service built/deployed. Critical family-sync, device-management and trip-day behavior still requires automated and production functional verification.

## Contribution / agent rule

Before a cross-cutting change:

1. read `AGENTS.md`,
2. inspect both CastleWatch repositories,
3. check the canonical backend project-state/architecture/roadmap documents,
4. distinguish live production code from legacy scaffolding,
5. add or update tests for behavioral changes,
6. keep changes incremental and reversible.
