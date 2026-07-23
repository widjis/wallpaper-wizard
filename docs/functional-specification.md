# Functional Specification

## Document Scope

This document defines the target functional behavior for CWCM and records the current implementation status observed in the repository.

## Current State Summary

The repository now provides a monorepo-based web and API foundation with live API-backed screens for major modules, but a few production behaviors are still blocked by infrastructure credentials and unfinished hardening work.

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
- basic route protection exists in the web shell
- full RBAC and role-specific action enforcement are still incomplete

### 2. Dashboard

Target behavior:

- show active campaign
- show current wallpaper
- show next scheduled campaign
- show queue status
- show scheduler health
- show deployment result summary
- show recent activity

Current state:

- present as static dashboard UI
- values are hardcoded
- not backed by API or real telemetry

### 3. Wallpaper Library

Target behavior:

- upload wallpaper
- replace wallpaper
- delete wallpaper
- download wallpaper
- preview wallpaper
- search and filter
- store metadata including resolution, size, checksum, uploader, and uploaded date

Current state:

- upload flow exists through the API and stores metadata in the database
- file storage path is used for uploaded assets
- delete, download, preview, search, and filter are not fully implemented

### 4. Campaign Management

Target behavior:

- create campaign
- edit campaign
- delete campaign
- duplicate campaign
- activate immediately
- cancel campaign
- set start date, end date, priority, and status

Current state:

- live campaign list exists
- create campaign form exists in the web UI
- overlap conflicts are validated in the API
- edit, delete, duplicate, activate-now, and cancel flows are still incomplete

### 5. Queue Management

Target behavior:

- display ordered deployment queue
- reorder campaigns
- pause queue
- resume queue
- remove campaign
- force deploy

Current state:

- queue ordering, pause, and resume flows are backed by the API
- queue state is persisted in the database
- remove campaign is still incomplete

### 6. Scheduler

Target behavior:

- check campaign schedule every minute
- activate eligible campaign
- complete expired campaign
- prevent overlap conflicts
- trigger deployment
- retry failed deployment according to policy

Current state:

- manual scheduler trigger endpoint exists
- automated recurring worker is not yet implemented with BullMQ or cron-backed production flow

### 7. Deployment Engine

Target behavior:

- find active campaign
- locate wallpaper
- validate file
- publish to SYSVOL target
- replace `Wallpaper.jpg`
- verify deployment result
- write deployment log

Current state:

- deployment trigger and verification endpoints exist
- SMB publish utility now exists in backend code
- production validation is blocked because external PostgreSQL schema could not be applied with the current credentials in `.env`

### 8. Deployment Verification

Target behavior:

- verify file existence
- verify file size
- verify modified date
- verify checksum
- classify result as success, failed, or warning

Current state:

- verification path now attempts publish and checksum comparison in backend code
- full operational verification remains blocked until the database schema can be applied and the environment can be exercised end-to-end

### 9. Deployment History

Target behavior:

- record campaign, wallpaper, operator, started time, finished time, duration, result, and message
- keep unlimited retention unless policy changes

Current state:

- history view consumes live deployment API responses

### 10. Activity Log

Target behavior:

- capture login, logout, upload, delete, scheduling, deploy, cancel, and settings changes

Current state:

- activity log is persisted and served from the API for core actions already implemented

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

Current state:

- settings are persisted through the API and database layer

### 12. User Management

Target behavior:

- manage users and roles
- enforce permissions

Current state:

- users list is served by the API
- full user administration workflow is still incomplete

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

## Current Implementation Verdict

The repository now satisfies a substantial part of the MVP functional surface, but it still does not fully satisfy the PRD because production database onboarding, full RBAC, automated scheduler workers, and fully validated SYSVOL deployment are not yet complete.
