# Implementation Roadmap

## Status Summary

- Active phase: Phase 5
- Overall status: MVP foundation is substantially implemented, and the residual hybrid mock/fallback UI backlog has now been cleared across the main web menus
- Last update reason: Docker-first implementation planning was added so deployment reproducibility is closed before BullMQ migration resumes

## Phase 0 - Documentation Baseline And Repo Assessment

### Objective

Create the documentation baseline required by `AGENTS.md`, assess the existing repository honestly against the PRD, and define the next implementation path before feature work continues.

### Source Documents

- `README.md`
- `AGENTS.md`
- `docs/project-plan.md`
- `docs/product-principles.md`
- `docs/functional-specification.md`
- `docs/technical-implementation-plan.md`
- `docs/database-schema-specification.md`
- `docs/openapi.yaml`
- user-provided PRD v2.0

### Checklist

- [x] review existing repository structure and implemented screens
- [x] confirm that mandatory `docs/` baseline was missing
- [x] create mandatory planning and specification documents
- [x] create gap analysis between current repository and PRD
- [x] update `README.md` to point to source-of-truth documents
- [x] confirm first-release authentication strategy
- [x] confirm deployment runtime strategy for SMB / SYSVOL access
- [x] confirm MVP frontend migration approach
- [x] confirm overlap handling rule for campaigns
- [x] review runtime environment keys for MVP dependencies
- [x] confirm Phase 1 workspace tooling choice
- [x] confirm uploaded wallpaper storage implementation for Phase 1

### Output

- documentation baseline exists
- current project gap is visible
- next implementation phases are defined

### Challenge / Verification

- verified that repo initially lacked the mandatory `docs/` files required by `AGENTS.md`
- verified through file review that current implementation is a static frontend prototype without backend, persistence, scheduler, queue, or deployment engine
- evidence recorded in `docs/existing-project-gap-analysis.md`
- `GetDiagnostics` returned no workspace diagnostics after documentation updates
- `npm run build` was attempted on 2026-07-23 and failed because local dependencies are not installed in this environment, resulting in `vite` not recognized
- user decisions were recorded for local auth, Linux container SMB deployment, overlap blocking, MVP-first frontend reuse, and UI-editable operational settings
- `.env` contains environment keys for PostgreSQL, SMB / domain access, and LDAP, which is sufficient for Phase 1 and later MVP runtime mapping

## Phase 1 - Monorepo Foundation

### Objective

Convert the repository into the target full TypeScript monorepo and scaffold runtime infrastructure.

### Source Documents

- `docs/project-plan.md`
- `docs/technical-implementation-plan.md`
- `docs/open-questions-and-challenges.md`

### Checklist

- [x] establish workspace layout under `apps/` and `packages/`
- [x] migrate current frontend into `apps/web`
- [x] scaffold API service in `apps/api`
- [x] add workspace package management and build tooling
- [x] add Docker Compose base services for web, api, and redis with external PostgreSQL from `.env`

### Output

- working monorepo skeleton
- frontend preserved in new structure
- backend scaffold ready for contracts and persistence

### Challenge / Verification

- `apps/web`, `apps/api`, `packages/types`, `packages/config`, `prisma/`, and `docker/` now exist in the repository
- `npm install`, `npm run build`, and `npm run lint` passed on 2026-07-23 after monorepo migration
- Docker Compose baseline was added in `docker-compose.yml` and updated to use external PostgreSQL from `.env` instead of an internal database container

## Phase 2 - API, Data Model, And Authentication

### Objective

Implement the initial backend contracts, persistence layer, and local authentication model.

### Source Documents

- `docs/functional-specification.md`
- `docs/openapi.yaml`
- `docs/database-schema-specification.md`

### Checklist

- [x] implement Prisma schema baseline
- [x] implement auth and session endpoints
- [x] implement users, wallpapers, campaigns, dashboard, history, settings, and health endpoints
- [x] add basic bearer-token gate for API endpoints
- [x] keep `docs/openapi.yaml` synchronized with current implementation details

### Output

- working backend for core data and auth
- persisted entities instead of mock data

### Challenge / Verification

- Prisma client generation passes against `prisma/schema.prisma`
- `npm run lint:api` and `npm run build:api` passed on 2026-07-23 after wiring Prisma runtime
- local auth login endpoint exists and non-auth `/api/*` routes require bearer token
- repository runtime now reads and writes to the external PostgreSQL instance defined in `.env`

## Phase 3 - Queue, Scheduler, And Deployment Engine

### Objective

Implement campaign orchestration and wallpaper publishing.

### Source Documents

- `docs/functional-specification.md`
- `docs/technical-implementation-plan.md`
- `docs/open-questions-and-challenges.md`

### Checklist

- [x] implement queue management and ordering
- [x] implement scheduler polling entrypoint
- [x] prevent overlapping campaigns according to agreed rules
- [x] implement wallpaper validation and deployment flow baseline
- [x] implement deployment verification trigger entrypoint
- [x] write deployment and activity logs in persisted runtime

### Output

- automated campaign activation
- auditable deployment workflow

### Challenge / Verification

- scheduler trigger endpoint and manual deployment trigger endpoint were added
- overlap validation blocks conflicting campaign creation
- SMB publish utility was implemented in backend code
- residual gap: end-to-end SYSVOL validation in the target environment is still pending

## Phase 4 - Frontend Integration

### Objective

Replace mock data with live API integration for operator-critical workflows and identify any residual hybrid UI that still requires cleanup.

### Source Documents

- `docs/functional-specification.md`
- `docs/openapi.yaml`

### Checklist

- [x] connect dashboard summary to live data
- [x] implement wallpaper upload baseline on API side and live wallpaper list in UI
- [x] implement campaign create flow from UI
- [x] implement campaign edit flow from UI
- [x] implement queue actions
- [x] implement deployment history baseline in UI
- [x] implement settings persistence
- [x] verify login and protected-route session handling in the web shell
- [x] remove residual dashboard static sections and fallback sample data
- [x] remove residual wallpaper-library sample cards and wire search/filter controls
- [x] remove residual queue fallback rows and clarify force-deploy UX
- [x] remove residual history sample rows and expose audit activity in UI
- [x] remove residual users sample rows and resolve synthetic email presentation
- [x] remove non-production debug instrumentation from the campaigns route
- [x] add role-aware navigation and action visibility in the web shell

### Output

- web portal with mock-free main operator workflows and role-aware navigation/action behavior

### Challenge / Verification

- main dashboard, wallpaper, campaign list, queue, deployment, history, users, and settings pages now consume at least one live API endpoint
- login screen and session handling were added to the web app
- browser smoke validation on 2026-07-23 passed for login, wallpaper upload, campaign create, campaign edit, queue pause/resume, settings save, deployment verify UI flow, and logout
- upload flow now shows explicit success or failure toast feedback in the operator UI
- wallpaper upload pipeline now normalizes every uploaded image to `image/jpeg` at `1920x1080`, stores the blob in PostgreSQL, and lowers JPG quality when the normalized output exceeds `2 MB`
- browser verification on 2026-07-23 confirmed a newly uploaded wallpaper rendered from `/api/wallpapers/{wallpaperId}/image` and displayed `1920x1080` with normalized size metadata
- legacy `storagePath` transitional support has now been removed from the database, and wallpaper storage is finalized as database-only
- browser verification on 2026-07-23 additionally confirmed `/campaigns`, `/timeline`, `/deployment`, `/history`, `/users`, and `/settings` remain stable on-route after the auth hydration fix
- campaigns now support create, edit, delete, duplicate, activate-now, cancel, and lightweight search/filter behavior from the web UI
- queue view now supports pause/resume, remove item, and move up/down reorder controls backed by the API
- users view now supports create, edit, and delete flows backed by protected API routes
- history view now supports client-side search, result toggle, date-range toggle, and CSV export against deployment rows
- route audit on 2026-07-23 initially identified residual frontend gaps in Dashboard, Wallpapers, Timeline, Deployment, History, Users, and shell affordances; those UI gaps were then implemented and re-verified on the same date, with final evidence recorded in `docs/ui-ux-wiring-audit.md`
- residual gap: role enforcement is still backend-minimal

## Phase 5 - Hardening And Release Readiness

### Objective

Prepare the product for operational deployment.

### Source Documents

- `docs/project-plan.md`
- `docs/technical-implementation-plan.md`
- `docs/open-questions-and-challenges.md`

### Checklist

- [x] add operational logging baseline through Fastify logger
- [x] add deployment and rollback runbook baseline
- [ ] verify performance targets
- [x] remove residual sample-data fallback from dashboard route
- [x] remove residual sample-data fallback from wallpaper route
- [x] remove residual sample-data fallback from timeline route
- [x] remove residual sample-data fallback from history route
- [x] remove residual sample-data fallback from users route
- [x] bind deployment detail panel to live deployment and settings data
- [x] expose activity audit data in `History & Audit` or split the screen into explicit deployment and audit sections
- [x] remove campaigns route debug telemetry to `127.0.0.1:7777`
- [x] replace hardcoded shell indicators such as notification count, environment badge, and version label or remove them from UX
- [x] implement role-aware menu visibility
- [x] implement role-aware mutation controls for campaigns, users, settings, and deployment actions
- [x] rerun browser verification menu by menu after residual UI cleanup
- [x] implement default wallpaper fallback when no campaign is active
- [x] verify security controls
- [x] finalize Docker Compose deployment guidance baseline
- [ ] align `docker-compose.yml` with the current required runtime topology (`web`, `api`, `redis`, external PostgreSQL)
- [ ] harden API and web Dockerfiles for reproducible Compose startup
- [ ] define Prisma/database initialization flow for Docker deployment
- [ ] run end-to-end `docker compose build` and `docker compose up` validation
- [ ] verify scheduler, deployment, and authentication behavior inside Docker runtime
- [ ] document the SMB / SYSVOL container-runtime failure mode precisely

### Output

- on-prem deployment package, operating guidance, and a mock-free operator UI baseline

### Challenge / Verification

- `npm install`, `npm run lint:api`, `npm run build:api`, `npm run lint:web`, `npm run build:web`, and `GetDiagnostics` were rerun during the latest work item
- `npm run db:prepare` and `npm run prisma:push` passed against the external PostgreSQL database on 2026-07-23 after credential resolution was corrected
- `node scripts/backfill-wallpaper-blobs.mjs` and `node scripts/finalize-wallpaper-db-only.mjs` passed, proving all wallpaper rows were promoted to blob-backed storage before removing the transitional `storagePath` column
- unauthenticated access to `/api/campaigns` returned `401`, proving the bearer gate is active for protected API routes
- browser verification confirmed login, logout, campaign mutations, queue actions, settings updates, and deployment verification requests execute through authenticated sessions
- browser debugging on 2026-07-23 confirmed `/campaigns` previously fell back to static mock rows, which made search, filter, edit, and delete appear broken; the UI was updated to use live rows only and now shows explicit loading, empty, and error states instead of mock data
- settings responses remain limited to operational values and do not expose bootstrap secrets from `.env`
- dashboard response baseline measured approximately `2087-2167 ms` across three authenticated runs in this workspace, which is close to but still above the PRD target of `< 2 seconds`
- settings response baseline measured approximately `2094-2235 ms` across three authenticated runs in this workspace, which is acceptable for current MVP hardening evidence but indicates the runtime still needs optimization
- deployment verify now returns a structured deployment result to the UI even when SMB validation fails, but the current environment still reports `the share is not valid`
- default wallpaper fallback was implemented on 2026-07-23:
  - admins can choose `defaultWallpaperId` from the Settings page
  - deployment selection now follows `active campaign -> eligible scheduled campaign -> default wallpaper`
  - expired active campaigns are auto-completed before fallback resolution
  - deployment logs now support default wallpaper runs without an active campaign id
  - deleting the configured default wallpaper is blocked
  - browser verification confirmed an admin changed the default wallpaper, cancelled the last active campaign, triggered `Force redeploy`, and the latest deployment switched to `Default wallpaper` using the selected wallpaper
- automated scheduler execution was upgraded on 2026-07-23:
  - Fastify runtime now starts an in-process recurring scheduler loop
  - `schedulerIntervalMinutes` now controls real automatic execution timing
  - `queueState=PAUSED` now suppresses scheduler execution and clears `nextRunAt`
  - dashboard scheduler status now reflects persisted heartbeat, `lastRunAt`, and `nextRunAt`
  - runtime verification confirmed deployment count increased automatically after resume and remained unchanged while paused
- Docker-first planning was added on 2026-07-23:
  - `docs/docker-implementation-plan.md` now defines the execution slices required before BullMQ migration resumes
  - next infrastructure priority is Docker reproducibility and container-runtime validation, not queue replacement
- final dev-host preview recheck after the authenticated thumbnail bridge change was noisy because `localhost:8080` intermittently refused connections, but the database-only storage cleanup itself was validated through DB finalization, API access, and successful builds
- residual release blockers are documented in this roadmap and supporting docs
- production deployment baseline now assumes the existing PostgreSQL instance defined in `.env`
- OpenAPI contract was updated in the same work item as the backend route and auth changes
- UI audit on 2026-07-23 refined the remaining hardening backlog into menu-level frontend cleanup tasks recorded in `docs/ui-ux-wiring-audit.md`
- follow-up implementation on 2026-07-23 removed the remaining UI fallback/mock patterns across Dashboard, Wallpapers, Campaigns, Timeline, Deployment, History, Users, and shell navigation
- browser verification on 2026-07-23 confirmed:
  - admin login works at the local dev host
  - admin can create a Viewer user from the `Users` page
  - Viewer sees only `Dashboard`, `Campaigns`, and `History & Audit`
  - direct Viewer access to `/wallpapers` is denied with an explicit access message
- lint and build rechecks on 2026-07-23 passed for `apps/web` after the UI cleanup; only pre-existing React Fast Refresh warnings remain in shared UI helper files

### Detailed Small-Slice Backlog

- Dashboard slice 1: completed
- Dashboard slice 2: completed
- Dashboard slice 3: completed
- Dashboard slice 4: completed
- Wallpapers slice 1: completed
- Wallpapers slice 2: completed
- Wallpapers slice 3: completed
- Wallpapers slice 4: completed
- Campaigns slice 1: completed
- Campaigns slice 2: completed
- Timeline slice 1: completed
- Timeline slice 2: completed
- Timeline slice 3: completed
- Deployment slice 1: completed
- Deployment slice 2: completed
- Deployment slice 3: completed
- History slice 1: completed
- History slice 2: completed
- History slice 3: completed
- Users slice 1: completed
- Users slice 2: completed
- Users slice 3: completed
- Shell slice 1: completed
- Shell slice 2: completed
- Shell slice 3: completed
- Verification slice 1: completed
- Verification slice 2: completed
- Default wallpaper slice 1: completed
- Default wallpaper slice 2: completed
- Default wallpaper slice 3: completed
