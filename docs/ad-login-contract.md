# Assigned Active Directory login — Phase 5

Approved 2026-09-27: AD verifies credentials; Administrators assign portal access through Users. This supersedes the earlier “LDAP deferred” decision for this implementation slice.

## Account and login rules

- Users has an explicit Sign-in method: Active Directory or Local. New UI assignments default to AD; existing database accounts remain LOCAL until explicitly converted in Users.
- Only an active, non-deleted portal account can attempt authentication. No first-login provisioning and no automatic AD-group-to-role mapping. Role and active status always come from the portal database.
- Username is the exact sAMAccountName or UPN assigned by the Administrator, matched case-insensitively. Do not strip arbitrary domains. DOMAIN\username is not supported; use sAMAccountName or full UPN. Do not automatically try multiple identities/passwords.
- New/changed AD assignments look up a single enabled person/user under LDAP_BASE_DN. Store its immutable objectGUID in adObjectId; reject ambiguous/unknown identities and duplicate directory assignments. Recreated AD users cannot inherit access through reuse of a username. Existing AD username changes require reassignment in Users.
- On login: check portal assignment first, service-bind and search AD, compare objectGUID, then bind a separate connection with the user's DN/password. Empty passwords are rejected before LDAP. Escape LDAP filter metacharacters. Close both connections on success/failure.
- AD passwords are never stored, logged, or accepted in Users. The legacy non-null passwordHash holds a random unusable bcrypt hash for AD accounts; it is never used for authentication. LOCAL accounts still use bcrypt. Switching to LOCAL requires a new password; switching to AD invalidates the old local password.
- No local-password fallback for AD credential, connectivity or certificate failures. LDAP outages return 503; denied credentials/access use a generic 401 without directory diagnostics. Service-bind failure is an availability failure, not a user's bad password.
- Session lifetime remains eight hours. Portal account changes revoke all its sessions; inactive/deleted accounts are rejected on every API request. Authentication revision validation, last-login update and session issuance run in one PostgreSQL Serializable transaction against the account-update/revocation transaction. Stale credentials and serialization conflicts fail with generic 401; credentials are not automatically retried. Access saves strictly advance `updatedAt` as the authentication revision (even same-millisecond/no-op saves); login preserves that revision. Existing sessions are not re-bound to AD on every request: an AD-only disable/password change becomes effective on the next login or portal revocation/expiry. Administrators can disable portal access during an AD outage without directory lookup.
- Keep at least one active LOCAL Administrator as recovery access. No AD account is created from LDAP_USER/LDAP_PASS environment variables. Legacy demo account seed creation was removed; the configured local seed administrator is retained and existing users are not rewritten at startup.

## UI contract

Users exposes Sign-in method in the form and table. AD selection hides the password field and explains assignment vs credentials. Local password changes remain masked. Save access confirms username, source, role, active status, and session revocation. Errors remain inline and preserve the form. Login no longer pre-fills a demo username and explains assigned AD/local access. No directory password reset, AD group mutation, or bulk directory import is introduced.

## Environment and TLS

Required for AD operations: LDAP_URL, LDAP_BIND_DN, LDAP_BIND_PASSWORD, LDAP_BASE_DN. Use the existing bind credential solely for directory search. LDAP_USER/LDAP_PASS are legacy keys and do not grant portal access or act as a credential fallback.

- `ldaps://`: TLS directly.
- `ldap://`: StartTLS must succeed before any password is sent.
- Minimum TLS 1.2. `LDAP_TLS_REJECT_UNAUTHORIZED` defaults to `true`; use a hostname matching the server certificate. On 2026-09-27 the owner explicitly requested certificate verification bypass because no CA is available. Set `LDAP_TLS_REJECT_UNAUTHORIZED=false` for that deployment. This skips certificate trust/identity checks only on LDAP connections; transport remains encrypted, and other services retain their TLS settings.
- Optional `LDAP_CA_FILE`: path to a trusted IT-issued CA chain PEM, e.g. `/app/certs/ad-ca-chain.pem` in Compose. Compose mounts `./certs:/app/certs:ro`. Never supply private keys. Restore verification when a trusted CA is available.
- `LDAP_TIMEOUT_MS`: 1000–30000 ms, default 5000, applied to connection and each LDAP operation. Directory search is bounded to two results.

Implementation library: [ldapts official documentation](https://github.com/ldapts/ldapts), covering bind/search, StartTLS, TLS options and timeouts.

## Additive database change and deployment

User gains `authSource TEXT NOT NULL DEFAULT 'LOCAL'` and nullable, unique `adObjectId`. Existing roles, passwords, active flags and assignments remain unchanged. Script: `prisma/changes/20260927-ad-login.sql`; idempotent application command: `npm run db:ad-schema`.

On the deployment host, after synchronizing source:

```sh
docker compose build api web
docker compose run --rm --no-deps api node scripts/apply-ad-schema.mjs
docker compose up -d
```

Apply the schema before starting the new API. No blanket `db push`, destructive reset, or automatic production schema change is required. The script derives the same application database URL and PostgreSQL SSL options from environment and prints no credentials. If LDAP needs a private CA, place its PEM in `certs/` and set LDAP_CA_FILE before restart.

Then sign in using the retained local administrator. In Users, create or edit an account, choose Active Directory, enter its AD username/UPN, choose its portal role/status, and Save access. Login with that assigned identity and its AD password. Converting your current account revokes its sessions; keep a separate local administrator for recovery.

## Verification boundaries

Local tests use directory/repository doubles, not real AD passwords. They cover assignment gates, empty passwords, no fallback, GUID checks, LDAP filter escaping, service/user bind distinction, StartTLS ordering, disconnects, source validation, password-free provisioning, and revocation during AD outage. Browser verification uses intercepted API fixtures.

The initial live TLS probe returned `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Following the owner-approved bypass on 2026-09-27, the local `.env` was set to `LDAP_TLS_REJECT_UNAUTHORIZED=false`: live service-account bind and lookup of `widji.santoso` succeeded, including a valid directory objectGUID. No end-user password login was attempted. Target-host acceptance still requires the environment setting, schema deployment, and assigned/unassigned/disabled-user login checks. Production schema migration and account source conversion have not been performed by this implementation task.

The LDAP certificate opt-out regression covers both LDAPS and StartTLS, retains minimum TLS 1.2, and checks that service and user connections use the explicit setting; verification remains enabled by default.

## Local verification evidence

- `npm run test:ad`: twelve isolated tests passed, including AD identity assignment without stored directory password and access revocation during directory outage.
- `npm run test:auth:postgres`: fourteen real PostgreSQL race/rollback regressions passed; setup, RED→GREEN evidence and publication boundary are recorded in `auth-session-race-verification.md`.
- `npm run test:wallpapers`: nine regression tests passed.
- `npm run test:ad:ui`: browser fixture checks passed and validate AD password omission, assignment confirmation, source switching/local-password requirement, and recoverable login outage.
- Production web/API build, frontend typecheck, Prisma schema validation, and lint passed; seven pre-existing React fast-refresh warnings remain informational.
- Live readiness remains pending: trusted CA/hostname, schema application, actual service bind/search, and assigned-user authentication. No credentials were sent during the failed certificate-trust probe.
