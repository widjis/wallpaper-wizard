# Open Questions And Challenges

## Purpose

Track unresolved product and technical questions that must be addressed before or during implementation.

## Decision Log

### 1. Authentication Strategy For Phase 1

Decision:

- release 1 uses local username and password authentication
- LDAP / Active Directory login is deferred to a later phase

Impact:

- phase 2 backend can implement local auth and session management without blocking on AD integration
- user provisioning remains application-managed for the MVP

### 2. Container Runtime And SYSVOL Access

Decision:

- deployment engine runs in Linux containers
- SYSVOL publishing uses SMB access from the container runtime
- credentials are provided through environment variables using a service account model

Impact:

- deployment component remains Docker Compose compatible
- SMB mount or copy strategy must be validated during Phase 3
- secrets must stay outside committed documentation and code

### 3. Storage Strategy For Uploaded Wallpapers

Question:

Where are uploaded wallpapers stored before deployment?

Current direction:

- uploaded assets should use a container-friendly application storage path
- deployed output targets SYSVOL through the configured SMB path

Remaining clarification:

- confirm whether the wallpaper source-of-truth for uploads should live on a Docker-managed volume or another managed storage path in Phase 1

### 4. Conflict Resolution Rules For Overlapping Campaigns

Decision:

- overlapping campaigns are blocked entirely
- users must correct schedule conflicts before a campaign can be saved or activated

Impact:

- scheduler logic becomes simpler and more deterministic
- API and UI validation must reject overlap on create, update, and immediate activation paths

### 5. Frontend Stack Migration Scope

Decision:

- the existing frontend stack is preserved for MVP delivery
- major frontend re-platforming is deferred until it becomes necessary

Impact:

- current UI prototype can be reused and wired to live APIs
- monorepo migration should move the current web app with minimal churn

### 6. Settings Ownership

Decision:

- operational settings are editable in the UI for administrators during MVP
- sensitive bootstrap secrets remain environment-managed

Examples of UI-editable settings:

- SYSVOL path
- wallpaper filename
- scheduler interval
- retry attempts
- deployment timeout
- upload size and allowed extensions

## Known Challenges

### 1. Large Gap Between Prototype And Target Architecture

The repository is currently a static frontend prototype, while the PRD requires a full enterprise platform with backend services, queueing, persistence, deployment logic, and Docker deployment.

### 2. Active Directory Integration Constraints

Publishing to SYSVOL must respect enterprise network, credential, and operational restrictions. These constraints are not yet documented in the repository.

### 3. Verification Requirements Need Concrete Rules

The PRD requires file existence, size, modified date, and checksum verification. Exact failure thresholds and warning rules still need agreement.

### 4. Documentation Must Stay Ahead Of Implementation

`AGENTS.md` requires docs to be the source of truth. Implementation should not continue on assumptions once ambiguity is identified.

### 5. Environment Mapping Must Stay Sanitized

The repository contains runtime environment variables for database, domain, SMB, and LDAP connectivity. Documentation may reference the required environment keys, but must not copy secrets into committed source files.

### 6. External PostgreSQL Credential Resolution

Resolved finding:

- `.env` already contained the correct database credentials
- runtime scripts originally preferred credentials embedded inside `POSTGRES_URL`
- the repository was updated so `POSTGRES_USERNAME` and `POSTGRES_PASSWORD` override the credentials embedded in `POSTGRES_URL` when present

Verification:

- `npm run db:prepare` passed
- `npm run prisma:push` passed against `wallpaperWizardDB`

### 7. Browser Runtime Defects During Hardening

Resolved finding:

- authenticated browser flows for campaign update and settings save originally failed even though the endpoints existed
- the root causes were an async auth lookup bug in the Fastify pre-handler and missing explicit CORS method/header allowances for `PUT` and `PATCH`
- the repository was updated so protected routes await token resolution correctly and browser preflight for `PUT` and `PATCH` is explicitly allowed

Verification:

- browser retest passed for campaign edit and settings save on 2026-07-23
- direct API calls also passed for campaign create, campaign update, and settings update

### 8. SYSVOL Verification In Target Environment

Resolved finding:

- end-to-end publishing through the CIFS-mounted SYSVOL volume has been tested successfully
- recurring scheduler checks previously rewrote the same file even when its content had not changed
- publishing now compares SHA-256 checksums before writing and skips the write when SYSVOL already contains identical content

Impact:

- frequent scheduler polling no longer causes unnecessary SYSVOL writes or modified-time churn
- a changed or missing target file is still published and verified normally

### 9. Wallpaper Storage Migration

Resolved implementation decision:

- wallpaper binaries are now stored as PostgreSQL blobs instead of filesystem-only source files
- the API normalizes every uploaded wallpaper to JPG Full HD `1920x1080`
- when the normalized JPG exceeds `2 MB`, the backend lowers output quality before persisting the blob

Operational note:

- the migration has now been finalized to full database-only storage after explicit backfill and SQL finalization
- existing environments still avoided destructive reset because the migration was completed through staged backfill first, then legacy column removal

### 10. Frontend Route Stability During Auth Hydration

Resolved finding:

- several protected routes intermittently appeared to "bounce" back to the dashboard or login screen during browser verification
- the root cause was that the auth provider restored session state from local storage inside `useEffect`, while route protection logic redirected before auth readiness was established
- the web app was updated to expose an explicit auth-ready state and defer protected-route redirects until auth hydration completes

Verification:

- browser retest passed for `/campaigns`, `/timeline`, `/deployment`, `/history`, `/users`, and `/settings` without the previous route instability
- timeline duplicate force-deploy control and dashboard duplicate-key warning were also cleaned up in the same work item

## Tracking Rule

Any newly discovered ambiguity that affects product behavior, architecture, security, deployment, or API contract must be added here before the related phase is declared complete.
