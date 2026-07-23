# Corporate Wallpaper Campaign Manager

Corporate Wallpaper Campaign Manager (CWCM) is an on-premise web application for managing Windows wallpaper campaigns in an Active Directory environment.

The product goal is to replace manual SYSVOL wallpaper replacement with a governed workflow for wallpaper upload, campaign scheduling, queue management, deployment execution, and audit logging. Active Directory Group Policy remains the delivery mechanism to endpoint computers.

## Current Status

This repository now contains an MVP foundation built as a monorepo with:

- `apps/web` for the TanStack-based frontend
- `apps/api` for the Fastify + Prisma backend
- PostgreSQL-backed persistence
- protected API routes and local auth
- live UI wiring for the main operator flows

The product is not yet release-ready. Residual gaps remain in RBAC, production scheduler/runtime validation, SYSVOL verification in the target environment, and removal of the last hybrid/mock UI fallbacks. Use the documents under `docs/` as the source of truth before continuing implementation.

## Source Of Truth

The following documents define the current planning baseline:

- `AGENTS.md`
- `docs/project-plan.md`
- `docs/product-principles.md`
- `docs/functional-specification.md`
- `docs/technical-implementation-plan.md`
- `docs/openapi.yaml`
- `docs/database-schema-specification.md`
- `docs/implementation-roadmap.md`
- `docs/open-questions-and-challenges.md`
- `docs/existing-project-gap-analysis.md`
- `docs/deployment-and-environment.md`
- `docs/docker-implementation-plan.md`

## Repository Status

Current repository layout:

```text
wallpaper-wizard/
|- apps/
|  |- api/             # Fastify API service
|  `- web/             # TanStack web app
|- packages/           # Shared packages and types
|- prisma/             # Prisma schema
|- docker/             # Dockerfiles
|- scripts/            # Operational and migration scripts
|- docs/               # Planning and source-of-truth documents
|- AGENTS.md           # Working method for agents
`- README.md           # Repository entry point
```

Target product layout from the PRD:

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

The repository has been migrated to the target monorepo baseline, although some planned packages and production-grade infrastructure pieces are still pending.

## Development

Requirements:

- Node.js 20+
- npm 10+

Run locally:

```sh
npm install
npm run dev
```

Build:

```sh
npm run build
```

Lint:

```sh
npm run lint
```

## Current Stack

- React
- TypeScript
- TanStack Start
- TanStack Router
- Tailwind CSS
- Radix UI based components

## Planned Target Stack

- Frontend: React, TypeScript, Vite, TanStack Router, TanStack Query, Tailwind CSS
- Backend: Fastify, TypeScript, Prisma ORM, Swagger, Pino Logger
- Database: PostgreSQL
- Queue and scheduler: Redis, BullMQ, NestJS Scheduler
- Reverse proxy: Nginx
- Deployment: Docker Compose

## Notes

- This project is connected to Lovable. Avoid rewriting published git history.
- Do not treat current live UI wiring as proof that the PRD is fully implemented; review `docs/ui-ux-wiring-audit.md` and `docs/implementation-roadmap.md` first.
- Before any non-trivial change, check the active phase in `docs/implementation-roadmap.md`.
- Current infrastructure priority is Docker-first deployment hardening; BullMQ planning resumes only after the Compose baseline is validated.
- The current Docker deployment model assumes an Ubuntu host where Docker mounts the SYSVOL share as a CIFS-backed named volume and exposes it to the API container at `/app/sysvol`.
