# Product Principles

## Purpose

These principles guide CWCM product and engineering decisions.

## Principles

### 1. Preserve Existing Active Directory Delivery

CWCM manages content publication to SYSVOL. It does not replace Active Directory Group Policy as the endpoint delivery mechanism.

### 2. No Client Agent

The system must not require additional software on endpoint machines. This keeps rollout simple and avoids client lifecycle overhead.

### 3. Centralized And Governed Operations

Wallpaper assets, campaign scheduling, deployment actions, and configuration must be managed from the application rather than through manual file operations on domain infrastructure.

### 4. Automation First

The scheduler and deployment engine should remove repetitive administrator actions wherever safe to do so.

### 5. Safe By Default

Deployment must validate input, target path, overwrite behavior, and verification results. Failures should be visible, logged, and retryable.

### 6. Full Auditability

Every meaningful action must be attributable to a user or system actor and preserved in deployment or activity logs.

### 7. Predictable Scheduling

Campaign activation rules must be deterministic, conflict-aware, and easy for operators to understand.

### 8. Operational Simplicity

The product should be deployable and maintainable in an on-premise environment using familiar infrastructure such as Docker Compose, PostgreSQL, Redis, and SMB.

### 9. TypeScript Everywhere

Use a unified TypeScript stack across frontend, backend, and shared packages to simplify maintenance and reduce context switching.

### 10. Documentation Before Assumption

Implementation must follow repository documents under `docs/`. If behavior is unclear, record the ambiguity before coding.

## Product Quality Bar

CWCM should feel trustworthy in an enterprise setting:

- clear status and health indicators
- explicit deployment evidence
- understandable failure messages
- controlled permissions
- durable history
- minimal operational surprise
