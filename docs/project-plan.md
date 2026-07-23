# Project Plan

## Document Status

- Product: Corporate Wallpaper Campaign Manager (CWCM)
- Version: 1.0
- Status: Draft baseline
- Source input: User PRD v2.0 and existing repository audit

## Problem Statement

Administrators currently need to replace wallpaper files in SYSVOL manually to publish a new corporate wallpaper. This process is operationally fragile, difficult to audit, and inefficient for scheduled or future campaigns.

CWCM will introduce a centralized web application that manages wallpapers and campaigns, then publishes the active wallpaper to SYSVOL automatically without requiring any client-side agent.

## Product Goal

Deliver an on-premise TypeScript-based system that:

- centralizes wallpaper asset management
- schedules and activates campaigns automatically
- publishes the active wallpaper to SYSVOL
- preserves compatibility with existing Active Directory Group Policy
- maintains full auditability for administrative actions and deployments
- deploys through Docker Compose

## Current Repository Assessment

The repository currently contains a frontend prototype for the administrative portal. It does not yet include:

- the required monorepo structure
- a backend API
- persistence and database schema implementation
- authentication and RBAC enforcement
- queue and scheduler implementation
- SMB / SYSVOL deployment integration
- Docker Compose runtime

See `docs/existing-project-gap-analysis.md` for the detailed audit.

## Project Scope

### In Scope

- wallpaper management
- campaign scheduling
- deployment queue
- automatic SYSVOL publishing
- deployment verification
- audit logging
- user authentication
- Docker-based deployment
- REST API
- responsive web UI

### Out Of Scope

- endpoint agent
- wallpaper policy management
- GPO creation
- endpoint monitoring
- Azure AD integration in the current phase

## Delivery Strategy

The project will progress in controlled phases:

1. documentation baseline and repo assessment
2. monorepo foundation and backend bootstrap
3. core domain implementation
4. deployment engine and SYSVOL integration
5. frontend integration with live API
6. hardening, operations, and release readiness

## Success Criteria

The project is considered ready when:

- administrators no longer replace SYSVOL files manually
- campaign activation and completion work automatically
- every deployment is auditable and traceable
- the current wallpaper can be managed entirely from the web application
- the system can be deployed through a single Docker Compose workflow
- frontend and backend are implemented in TypeScript within a cohesive repository structure

## Risks

- unclear Windows SMB access strategy from Linux containers to SYSVOL
- unresolved authentication approach for the first release
- current repository structure differs significantly from the target monorepo architecture
- deployment verification rules need concrete agreement on checksum and failure handling

## Immediate Next Step

Treat the current active phase as a documentation and architecture baseline phase before implementing new product logic.
