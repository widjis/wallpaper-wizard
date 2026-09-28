# Functional Specification

## Document Scope

This document defines the target functional behavior for CWCM and records the current implementation status observed in the repository.

## Current State Summary

The repository now provides a monorepo-based web and API foundation with live API-backed screens for every main menu, and the residual hybrid/mock UI backlog for the current operator and administrator routes has been cleared. The detailed route-by-route status lives in `docs/ui-ux-wiring-audit.md`.

## Functional Modules

### 1. Authentication

Target behavior:

- login
- logout
- session management
- role-based access control for Administrator, Operator, and Viewer

Current state:

- local login screen exists
- bearer-token session state exists in the API and web client
- the web client validates persisted sessions through `GET /api/auth/session` before treating startup authentication as ready
- expired, revoked, unknown, and inactive-user sessions return a structured `401`; all frontend request types clear invalid local session state consistently
- temporary API/proxy failures preserve the local session and are treated separately from authentication expiry
- basic route protection exists in the web shell
- role-based navigation and role-based action enforcement now exist in the main web flows
- backend authorization remains minimal compared with full production-grade RBAC
- deleting a portal account revokes its sessions, hides it from active user listings, and preserves historical wallpaper/campaign/settings ownership through a soft-delete tombstone
- administrators cannot delete their own account or the last remaining active administrator

### 2. Dashboard

Target behavior:

- show active campaign
- show current wallpaper
- show next scheduled campaign
- show queue status
- show scheduler health
- show deployment result summary
- show recent activity
- show configured default wallpaper in system information

Current state:

- `GET /api/dashboard/summary` is wired and provides current campaign, next campaign, scheduler status, deployment stats, recent activity, and system information including the configured default wallpaper
- upcoming campaign cards, wallpaper preview, deployment donut, and CTA behavior now use live data or explicit empty states
- dashboard transport failures render an explicit unavailable/retry state and are never represented as valid empty campaign or deployment data
- dashboard aggregation and campaign/deployment/queue list queries exclude wallpaper binary blobs; image bytes are fetched only from the dedicated protected image endpoint

### 3. Wallpaper Library

Target behavior:

- upload wallpaper
- replace wallpaper
- delete wallpaper
- download wallpaper
- preview wallpaper
- search and filter
- mark wallpaper configured as the system default
- store metadata including resolution, size, checksum, uploader, and uploaded date

Current state:

- upload, list, preview, download, and delete flows are wired to the API
- wallpaper binaries are stored in PostgreSQL as normalized JPG blobs rather than filesystem-only paths
- search and usage filtering now work against live wallpaper rows
- the wallpaper configured as default is surfaced in the UI and protected from deletion
- unauthorized roles are denied from the wallpaper route

Approved Library workflow (2026-09-27):

- `../UX-CONTRACT.md` defines card/detail actions, role permissions, upload preview, deletion safeguards, and empty/error states.
- Cards and detail views open Create campaign with the selected image; no campaign is saved automatically.
- Administrators can choose the default directly in Library through an isolated setting update and explicit fallback explanation.
- Details expose uploader, metadata, all campaign references and schedules; title/description can be edited without replacing image bytes.
- Preview-before-save uses server normalization without persisting an asset. JPG/PNG source ceiling remains 64 MiB. Saving does not publish.
- Default and draft/scheduled/active usage block deletion server-side. Default and campaign badges can coexist; Unused means no campaign references and not default.
- Filters, sorting and search are explicit; image/list failures support retry. Library and upload changes are authorized server-side.

### 4. Campaign Management

Target behavior:

- create campaign
- edit campaign
- delete campaign
- duplicate campaign
- activate immediately
- cancel campaign
- set start date, end date, timezone, priority, and status

Current state:

- live campaign list and mutation flows exist in the web UI
- overlap conflicts are validated in the API
- create, edit, delete, duplicate, activate-now, and cancel flows are wired
- campaigns now persist an explicit IANA timezone for the scheduled window, and duplicate-then-edit flows can transition from `DRAFT` to `SCHEDULED` when a valid schedule is saved
- Viewer users now get read-only access while mutation actions are limited to Administrator and Operator

### 5. Queue Management

Target behavior:

- display ordered deployment queue
- reorder campaigns
- pause queue
- resume queue
- remove campaign
- force deploy

Current state:

- queue ordering, pause, resume, remove, and manual deploy trigger flows are backed by the API
- queue state is persisted in the database
- the screen now uses explicit loading, empty, and error states instead of fallback queue rows
- force deploy is presented as a global queue action

### 6. Scheduler

Target behavior:

- check campaign schedule every minute
- activate eligible campaign
- complete expired campaign
- prevent overlap conflicts
- trigger deployment
- fall back to default wallpaper when no campaign is active
- retry failed deployment according to policy

Current state:

- manual scheduler trigger endpoint exists
- an in-process runtime scheduler now executes recurring cycles based on `schedulerIntervalMinutes`
- deployment source selection now follows `active campaign -> eligible scheduled campaign -> configured default wallpaper`
- queue pause now suppresses automatic scheduler execution and clears the next scheduled run
- scheduler health, last run, and next run are now derived from persisted runtime heartbeat metadata
- Redis / BullMQ-backed worker orchestration is still not implemented

### 7. Deployment Engine

Target behavior:

- find active campaign
- locate wallpaper
- validate file
- compare the source checksum with the existing SYSVOL file
- skip the write when the existing SYSVOL file already has the same checksum
- publish to SYSVOL target
- replace `Wallpaper.jpg`
- verify deployment result
- write deployment log
- use default wallpaper as fallback when no active campaign is available

Current state:

- deployment trigger and verification endpoints exist
- SMB publish utility now exists in backend code
- CIFS-mounted SYSVOL publishing has been validated successfully in the target environment
- recurring deployment checks are idempotent: a matching SYSVOL file is verified without being written again
- automatic scheduler polling now treats checksum-matching runs as heartbeat/runtime updates instead of user-facing deployment history entries
- the deployment page now renders live wallpaper preview, live target detail, and result-aware deployment steps
- deployment history can now record default wallpaper deployments without an active campaign
- deployment history responses are paginated so the `History & Audit` screen can stay responsive even after large scheduler volumes accumulate

### 8. Deployment Verification

Target behavior:

- verify file existence
- verify file size
- verify modified date
- verify checksum
- classify result as success, failed, or warning

Current state:

- verification reads and compares the existing SYSVOL checksum before deciding whether a write is required
- end-to-end SYSVOL publishing has been validated successfully in the target environment

### 9. Deployment History

Target behavior:

- record campaign, wallpaper, operator, started time, finished time, duration, result, and message
- keep unlimited retention unless policy changes

Current state:

- history view consumes live deployment API responses with explicit loading, empty, and error states
- history view now requests deployment rows page-by-page instead of loading the entire deployment log at once

### 10. Activity Log

Target behavior:

- capture login, logout, upload, delete, scheduling, deploy, cancel, and settings changes

Current state:

- activity log is persisted and served from the API for core actions already implemented
- the `History & Audit` screen now renders the activity endpoint alongside deployment history

### 11. Settings

Target behavior:

- configure SYSVOL path
- configure wallpaper filename
- configure storage location
- configure maximum upload size
- configure allowed file extensions
- configure scheduler interval
- configure retry policy
- configure deployment timeout
- configure default wallpaper fallback

Current state:

- settings are persisted through the API and database layer
- the page is fully wired for current MVP scope and does not rely on local mock data
- non-admin roles are restricted from changing settings
- admins can configure a default wallpaper that is deployed automatically when no campaign is active

### 12. User Management

Target behavior:

- manage users and roles
- enforce permissions

Current state:

- users list plus create, edit, and delete flows are served by the API
- sample users and fabricated email presentation were removed from the UI
- user administration is restricted to Administrator at the route level

## Roles

### Administrator

- full access

### Operator

- upload wallpaper
- manage campaigns
- schedule campaigns
- deploy wallpaper

### Viewer

- view dashboard
- view campaigns
- view history

## Cross-Cutting Functional Rules

- the system must not deploy directly to endpoint devices
- Group Policy remains the delivery path for clients
- campaign overlap must be handled deterministically
- every deployment action must create a traceable log
- wallpaper publishing must target a configurable SYSVOL path and filename
- when no campaign is active, the system must deploy the configured default wallpaper instead of keeping the last campaign wallpaper indefinitely

## Current Implementation Verdict

The repository now satisfies a substantial part of the MVP functional surface, including default wallpaper fallback and validated SYSVOL publishing, but it still does not fully satisfy the PRD because backend-grade RBAC depth and Redis / BullMQ-backed scheduler workers are not yet complete.

## Assigned AD authentication — 2026-09-27

The user approved AD login with access and roles assigned only through Users. This supersedes earlier LDAP deferral notes. See `ad-login-contract.md` for credential/assignment boundaries, explicit AD/LOCAL source, objectGUID identity pinning, TLS/CA configuration, session revocation, additive schema deployment, and verification limitations. Existing accounts remain LOCAL until explicitly changed in Users.
