# Technical Implementation Plan

## Objective

Define the target technical architecture for CWCM and the migration path from the current frontend prototype to the required production-ready platform.

## Current Technical State

The repository now contains:

- a workspace-style repository with `apps/web` and `apps/api`
- a preserved TanStack Start frontend in `apps/web`
- a Fastify-based API baseline in `apps/api`
- a shared types package in `packages/types`
- a Prisma schema in `prisma/schema.prisma`
- a Prisma-backed runtime repository layer against the external PostgreSQL configured in `.env`
- a Docker Compose baseline and Dockerfiles for web and api that assume an external PostgreSQL instance from `.env`
- browser-verified campaign edit, settings persistence, queue control, and deployment verification flows
- a normalized wallpaper pipeline that stores JPG Full HD image blobs directly in PostgreSQL instead of relying on filesystem-only source storage

The repository still does not fully contain:

- real Redis / BullMQ workers wired into runtime, even though an in-process recurring scheduler now exists in the API runtime
- Nginx reverse proxy
- full RBAC and user administration workflow
- performance tuning sufficient to meet the PRD dashboard target of under 2 seconds in the current workspace

## Target Architecture

### Repository Shape

```text
cwcm/
|- apps/
|  |- api/
|  `- web/
|- packages/
|  |- shared/
|  |- types/
|  |- ui/
|  `- config/
|- docker/
|- docs/
|- prisma/
|- scripts/
|- package.json
|- turbo.json
`- docker-compose.yml
```

### Frontend

- React + TypeScript
- Vite
- Material UI
- TanStack Query
- React Router
- Zustand

### Backend

- Fastify baseline implemented for MVP foundation
- Prisma ORM
- Swagger
- Pino logger

### Data And Jobs

- PostgreSQL for system-of-record storage
- Redis for queue and scheduler support
- BullMQ for job queueing and delayed execution

### Deployment

- Docker Compose for local and on-prem deployment
- Nginx as future reverse proxy target
- production PostgreSQL is external and not provisioned by repository Compose

## Core Technical Modules

### API Modules

- auth
- users
- dashboard
- wallpapers
- campaigns
- queue
- scheduler
- deployment
- audit
- configuration
- health

### Infrastructure Components

- file storage abstraction
- SMB / UNC publishing service
- scheduler worker
- deployment worker
- audit event writer
- checksum and verification service

## Migration Strategy

### Phase 0: Documentation Baseline

- document target product scope
- document current repo gap
- define roadmap and open questions
- record MVP decisions for auth, frontend reuse, overlap validation, and environment handling

### Phase 1: Monorepo Foundation

- convert current repo into monorepo structure
- move existing UI into `apps/web`
- scaffold `apps/api`
- add shared config and workspace tooling
- add Docker Compose base stack
- preserve the current frontend stack for MVP instead of re-platforming the UI immediately

### Phase 2: Persistence And Contracts

- define Prisma schema
- create initial migrations
- implement OpenAPI-aligned API modules
- expose health, auth, wallpapers, campaigns, dashboard, history, settings endpoints

### Phase 3: Scheduler And Queue

- add BullMQ queues
- implement campaign activation logic
- implement overlap prevention and retry rules

### Phase 4: Deployment Engine

- implement wallpaper validation
- implement SYSVOL publish flow
- implement deployment verification checks
- write deployment logs

### Phase 5: Frontend Integration

- replace mock data with API-driven state
- add authentication flow
- add role-aware navigation and actions
- add forms, validation, and mutations

### Phase 6: Hardening

- observability
- security review
- operational scripts
- deployment and rollback procedures

## Architectural Decisions Pending

- whether the current Fastify MVP baseline should remain or be replaced by NestJS in the next architecture step
- whether React Router replaces TanStack Router only after backend stabilization or stays deferred longer
- when real Redis / BullMQ workers are introduced versus simulated scheduler entrypoints

## Architectural Decisions Confirmed

- release 1 uses local auth
- LDAP login is deferred
- deployment runs in Linux containers with SMB access to SYSVOL
- campaign overlaps are blocked instead of auto-resolved
- existing frontend stack is retained for MVP delivery
- bootstrap secrets are sourced from `.env`

## Non-Functional Design Notes

- deployment actions must be idempotent where practical
- SYSVOL publishing through the CIFS-mounted filesystem compares SHA-256 checksums and skips rewriting an identical target
- retry policies must distinguish temporary network failure from validation failure
- audit logs must preserve actor and action metadata
- configuration changes must be protected by role checks and logged
- health endpoints should expose app, database, queue, and storage connectivity

## Immediate Recommendation

Treat the repository as an implemented MVP foundation with live web/API integration, then focus the next iteration on Docker deployment reproducibility and target-environment SMB validation before resuming BullMQ migration work.
