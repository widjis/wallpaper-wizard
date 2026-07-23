# Corporate Wallpaper Campaign Manager

Corporate Wallpaper Campaign Manager (CWCM) is an on-premise web application for managing Windows wallpaper campaigns in an Active Directory environment.

The product goal is to replace manual SYSVOL wallpaper replacement with a governed workflow for wallpaper upload, campaign scheduling, queue management, deployment execution, and audit logging. Active Directory Group Policy remains the delivery mechanism to endpoint computers.

## Current Status

This repository currently contains an early frontend prototype built with Lovable and TanStack Start. It already shows the intended CWCM screens, but it does not yet implement the backend services, persistence layer, scheduler, deployment engine, or Active Directory / SYSVOL integration required by the PRD.

Use the documents under `docs/` as the source of truth before continuing implementation.

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

## Repository Status

Current repository layout:

```text
wallpaper-wizard/
|- src/                # Existing frontend prototype
|- public/             # Static assets
|- docs/               # Planning and source-of-truth documents
|- AGENTS.md           # Working method for agents
|- README.md           # Repository entry point
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

The repository has not yet been migrated to the target monorepo layout.

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

- Frontend: React, TypeScript, Vite, Material UI, TanStack Query, React Router, Zustand
- Backend: NestJS, TypeScript, Prisma ORM, Swagger, Pino Logger
- Database: PostgreSQL
- Queue and scheduler: Redis, BullMQ, NestJS Scheduler
- Reverse proxy: Nginx
- Deployment: Docker Compose

## Notes

- This project is connected to Lovable. Avoid rewriting published git history.
- Do not treat the current UI prototype as proof that the PRD is implemented.
- Before any non-trivial change, check the active phase in `docs/implementation-roadmap.md`.
