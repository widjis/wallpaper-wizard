# Implementation Roadmap

## Status Summary

- Active phase: Phase 5
- Overall status: MVP foundation is substantially implemented, with final release closure blocked by external PostgreSQL credentials and remaining hardening gaps
- Last update reason: login UI, campaign creation UI, SMB publish utility, DB preparation scripts, and final verification were advanced, and residual infrastructure blockers were documented

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
- residual gap: end-to-end SYSVOL validation is not closed because target database schema could not be applied with the current external PostgreSQL credentials

## Phase 4 - Frontend Integration

### Objective

Replace mock data with live API integration and complete operator workflows.

### Source Documents

- `docs/functional-specification.md`
- `docs/openapi.yaml`

### Checklist

- [x] connect dashboard to live data
- [x] implement wallpaper upload baseline on API side and live wallpaper list in UI
- [x] implement campaign create flow from UI
- [ ] implement campaign edit flow from UI
- [x] implement queue actions
- [x] implement deployment history and activity log views
- [x] implement settings persistence

### Output

- real working web portal for operators and administrators

### Challenge / Verification

- main dashboard, wallpaper, campaign list, queue, deployment, history, users, and settings pages now consume live API endpoints
- login screen and session handling were added to the web app
- residual gap: role enforcement is still backend-minimal and edit/delete campaign flows remain incomplete

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
- [ ] verify security controls
- [x] finalize Docker Compose deployment guidance baseline

### Output

- on-prem deployment package and operating guidance

### Challenge / Verification

- `npm install`, `npm run lint:api`, `npm run build:api`, `npm run lint:web`, `npm run build:web`, and `GetDiagnostics` were rerun during the latest work item
- residual release blockers are documented in this roadmap and supporting docs
- production deployment baseline now assumes the existing PostgreSQL instance defined in `.env`
- OpenAPI contract was updated in the same work item as the backend route and auth changes
- external PostgreSQL schema apply remains blocked by Prisma error `P1000` with the current credentials resolved from `.env`
