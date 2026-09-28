# Authentication session race — verification and publication checkpoint

## Scope

Phase 5 hardening, following `AGENTS.md`, `ad-login-contract.md`, the technical implementation plan, data-model specification and OpenAPI. Fix the confirmed P1 authentication/session revocation race while preserving the existing assigned AD login and Wallpaper Library work. No live database changes, LDAP operations or deployment are authorized by this publication task.

Baseline local `main` and remote `origin/main` were both `a2be381804241a42b5ff94935e23e3f0a9323f43`. The earlier independent review held publication because an in-flight AD login could insert a valid session after an Administrator changed that account to LOCAL and revoked sessions.

## Reproduction and fix

- The original repository/directory-double probe reproduced `acceptedAfterSourceConversion=true` before changes.
- A new regression runs the actual repository functions and Prisma adapter against a disposable **real PostgreSQL 18.4** database, not a transaction/mutex simulation. A deterministic barrier pauses the final account read, commits the Administrator's update on another database connection, then resumes login.
- RED: the test failed with `stale AD credentials issued a usable session after revocation`; session lookup returned a LOCAL account for credentials authenticated by AD.
- GREEN: account revision validation, `lastLoginAt` write and session insertion now share one PostgreSQL `Serializable` transaction. The account write conflicts with concurrent account-update/revocation transactions across processes. A Prisma `P2034` serialization conflict becomes generic `InvalidLogin` (401); no stale credential retry occurs. Database errors otherwise retain the existing unavailable behavior.
- Access saves strictly advance `updatedAt` using `max(now, previous + 1 ms)`, including no-op revocations. Login preserves the revision while updating `lastLoginAt`. Separate RED→GREEN tests demonstrated backwards-clock revision regression and login resetting the revision. This avoids timestamp collisions or clock rollback re-accepting stale authentication; no new schema or migration is needed for the race fix.
- If login commits first, a subsequent successful access update revokes its session. If an overlapping Administrator transaction loses serialization, it fails instead of claiming revocation succeeded; the operator must reload/retry the failed save. No automatic credential retry is introduced.

## Repeatable PostgreSQL regression command

`npm run test:auth:postgres` requires `AUTH_RACE_TEST_DATABASE_URL` pointing to an **isolated, disposable** loopback PostgreSQL database named exactly `cwcm_auth_race_test`, on a non-default port. Never point this test at an application database: it deletes test users, sessions and activity logs between cases.

Create that empty database in an isolated PostgreSQL instance, then apply the current schema **only to that disposable instance**:

```sh
POSTGRES_APP_URL="$AUTH_RACE_TEST_DATABASE_URL" npx --no-install prisma db push --schema prisma/schema.prisma --skip-generate
npm run test:auth:postgres
```

The tests validate the target before loading application configuration, and restore the explicit test URL after dotenv's runtime override. They do not start the API, scheduler, Redis or any directory connection. AD credential verification is stubbed; database operations, transactions, local password hashing and session lookup are real.

This Mac had no usable Docker daemon or installed PostgreSQL server. Verification used an ephemeral native PostgreSQL package installed only under ignored `.auth-review.local/runtime`, with random credentials and a dynamically assigned loopback port. `.auth-review.local/run-postgres-tests.mjs` creates and shuts down that disposable cluster; no package or lockfile dependency was added for the temporary server.

## Verification results

- PostgreSQL integration suite: **14/14 pass**. Covers source conversion in both directions after final read, disable, role change, no-op revocation, deletion, update during AD bind, local-password reset, successful LOCAL/AD login, both overlapping write orderings, sequential login-before-revocation, rollback after executed session INSERT and session revocation, and monotonic/preserved account revisions.
- `npm run test:ad`: **12/12 pass**.
- `npm run test:wallpapers`: **9/9 pass**.
- `npm run build`: web and API pass.
- `npx --no-install tsc --noEmit -p apps/web/tsconfig.json`: pass; API typecheck is included in its build.
- `npm run lint`: pass, zero errors; seven pre-existing React fast-refresh warnings remain.
- `POSTGRES_APP_URL=postgresql://localhost:1/schema_validation_only npx --no-install prisma validate --schema prisma/schema.prisma`: pass without connecting to a database.
- `git diff --check`: pass.
- README now requires Node.js 22+ because ldapts requires it.
- `docs/openapi.yaml` was reviewed and updated to describe atomic revision validation/session issuance and generic 401 on serialization conflict; endpoint shapes and session lifetime remain unchanged. AD contract and roadmap are synchronized.
- Previous independent UI verification remains applicable to the unchanged UI: AD fixtures passed and Wallpaper Library Administrator/Operator flows passed. This race-fix pass does not claim new live-browser or production authentication acceptance.

## Review and publication boundary

Added-line/untracked-file static scan found only isolated test fixture passwords/tokens; no private keys, dynamic execution or unsafe SQL interpolation. The original worktree inventory, prior review, current scan and independent re-review are retained under ignored `.auth-review.local/`; this document is the durable tracked evidence summary.

The independent baseline-aware re-review passed with no newly introduced security or logic concerns. It independently compared the broader findings with the baseline: operational RBAC gaps, legacy wallpaper-reference concurrency/activation/duplication gaps, and the explicitly approved LDAP trust exception remain documented in `open-questions-and-challenges.md`, not silently marked resolved. The final executed logs (`.auth-review.local/*-final.log` and `final-test-results.json`) supersede the initial ten-case evidence: all fourteen PostgreSQL regressions pass, including the four review-suggested rollback/ordering controls. This is a scoped publication review, not a declaration of production readiness.

The existing AD additive schema script is included with the previously authorized work but **has not been applied to any live database**. Target-host schema deployment, LDAP acceptance, Docker/runtime and remaining Phase 5 checks remain pending. Git publication is not deployment.
