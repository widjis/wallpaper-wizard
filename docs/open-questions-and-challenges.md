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

### 6. External PostgreSQL Credential Mismatch

Observed blocker:

- schema apply against the external PostgreSQL instance failed with Prisma error `P1000`
- the connection string currently resolved from `.env` authenticates as `postgres`, but the server rejected those credentials for `wallpaperWizardDB`

Impact:

- database schema could not be pushed to the target environment from this workspace
- API runtime code is prepared for PostgreSQL-backed operation, but end-to-end persistence cannot be declared verified until valid credentials are provided

## Tracking Rule

Any newly discovered ambiguity that affects product behavior, architecture, security, deployment, or API contract must be added here before the related phase is declared complete.
