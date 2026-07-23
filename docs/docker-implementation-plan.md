# Docker Implementation Plan

## Purpose

Define the execution plan for making CWCM deployable through Docker Compose before introducing BullMQ-based persistent workers.

## Current Baseline

The repository already contains:

- `docker-compose.yml`
- `docker/api.Dockerfile`
- `docker/web.Dockerfile`
- external PostgreSQL runtime configuration through `.env`
- Redis configuration variables in the environment

The current baseline is not yet implementation-complete for a production-like Compose deployment because:

- `docker-compose.yml` currently defines only `api` and `web`, while repository docs already claim a `redis` service exists
- API and web container startup assumptions have not been revalidated against the latest scheduler and deployment behavior
- container runtime flow for Prisma generation / schema sync is not yet formalized
- the SMB / SYSVOL dependency is still environment-sensitive and remains the main external integration risk
- there is not yet a documented, repeatable `docker compose up` validation sequence tied to the latest application behavior

## Goal

Reach a Docker-first operational baseline where the application can be brought up in a controlled way with:

- `web`
- `api`
- `redis`
- external PostgreSQL

and where operators have a repeatable startup, validation, and rollback flow before BullMQ is introduced.

## Delivery Order

### Slice 1 - Compose Baseline Audit And Alignment

Objective:

- make the repository and docs agree on the current Compose topology

Tasks:

- review `docker-compose.yml` service definitions against actual runtime needs
- verify whether Redis is started by Compose or expected externally
- verify current API and web port strategy
- verify environment key mapping for container runtime
- identify any missing volumes, health checks, restart policy, or service dependencies

Definition of done:

- documented gap list exists
- target Compose topology is agreed as `web + api + redis + external postgres`

### Slice 2 - API Container Hardening

Objective:

- make the API image reproducible and runnable in Compose

Tasks:

- confirm Node version and build strategy in `docker/api.Dockerfile`
- verify Prisma client generation inside image build or container startup
- verify runtime command for Fastify production start
- ensure required env vars are validated clearly at startup
- confirm image includes everything needed for scheduler and SMB publishing code paths

Definition of done:

- API container builds cleanly
- API container starts in Compose and reaches healthy state
- health endpoint responds from inside Compose

### Slice 3 - Web Container Hardening

Objective:

- make the web image reproducible and correctly wired to the API service

Tasks:

- verify `VITE_API_BASE_URL` strategy for container-to-container calls
- confirm whether `vite preview` remains acceptable for deployment baseline or should be replaced later
- verify web service waits for API availability or handles delayed API startup gracefully
- confirm exposed port and browser access flow

Definition of done:

- web container builds cleanly
- login page loads through Compose
- authenticated UI can reach API through container network

### Slice 4 - Redis In Compose

Objective:

- make Redis available in Compose now so later BullMQ adoption has a stable base

Tasks:

- add Redis service to `docker-compose.yml`
- define container name, port exposure policy, and restart behavior
- ensure API can resolve `REDIS_URL` through Docker network naming
- validate API health behavior when Redis is configured but optional versus required

Definition of done:

- Redis starts through Compose
- API resolves Redis host successfully
- Compose topology matches repository docs

### Slice 5 - Runtime Init Flow

Objective:

- define the exact boot order and initialization commands needed for a clean environment

Tasks:

- decide whether Prisma schema sync runs manually, as an init step, or as an explicit operator command
- define whether `npm run prisma:push` remains outside Compose or becomes part of container lifecycle
- define the operator command sequence for first startup and restart
- verify behavior when PostgreSQL is reachable but target DB/schema is not yet prepared

Definition of done:

- startup sequence is documented with exact commands
- operator can bring the stack up without guesswork

### Slice 6 - Compose Validation

Objective:

- prove Docker deployment works for the current MVP baseline

Tasks:

- run `docker compose build`
- run `docker compose up`
- verify API health endpoint
- verify web login page
- verify authenticated dashboard load
- verify wallpaper upload
- verify campaign create/edit
- verify queue pause/resume
- verify settings save
- verify manual deployment trigger
- verify scheduler status visibility

Definition of done:

- validation evidence is recorded in roadmap/runbook
- failures are classified as app issue versus environment issue

### Slice 7 - SMB / SYSVOL Validation In Container Context

Objective:

- isolate Docker-runtime behavior for the external deployment path

Tasks:

- validate whether the container can reach the SMB target using current credentials and path settings
- confirm whether additional Linux packages, mount strategy, or runtime privileges are required
- capture exact failure mode when SYSVOL verification fails
- decide whether publish should remain direct SMB copy or move to a mounted-share strategy

Definition of done:

- external deployment blocker is documented precisely
- next SMB-specific implementation task is clear

### Slice 8 - Release Handoff Baseline

Objective:

- close the Docker-first planning loop before BullMQ work starts

Tasks:

- update `docs/implementation-roadmap.md`
- update `docs/deployment-and-environment.md`
- update `docs/operational-runbook.md`
- update `README.md` if startup instructions change
- explicitly defer BullMQ until Docker baseline is stable

Definition of done:

- docs are synchronized
- next active implementation target is Docker execution, not BullMQ

## Recommended Immediate Execution Order

1. Align `docker-compose.yml` with actual required services
2. Harden `docker/api.Dockerfile`
3. Harden `docker/web.Dockerfile`
4. Add Redis service and Compose health/dependency behavior
5. Define Prisma / startup operational flow
6. Run full Compose validation
7. Investigate SMB / SYSVOL behavior from container runtime
8. Only after the above is stable, reopen BullMQ planning

## BullMQ Deferral Rule

BullMQ should remain deferred until all of the following are true:

- Compose stack is reproducible
- Redis service behavior is validated in Docker
- startup and restart flow is documented
- scheduler/deployment behavior is verified in container runtime
- SMB / SYSVOL failure mode is understood in Docker context

## Verification Standard

The Docker implementation phase should not be marked complete until evidence exists for:

- successful `docker compose build`
- successful `docker compose up`
- reachable web UI
- reachable API health endpoint
- authenticated workflow smoke checks
- explicit SMB / SYSVOL result from container runtime
