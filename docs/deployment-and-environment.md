# Deployment And Environment

## Purpose

Document the environment inputs required for CWCM MVP deployment without storing secrets in repository documentation.

## Current Deployment Direction

- runtime model: Docker Compose
- deployment engine runtime: Linux containers
- SYSVOL publishing: CIFS-mounted Docker volume on the Ubuntu host, exposed into the API container as a local filesystem path
- authentication for MVP: local application auth
- future capability available in environment: LDAP / Active Directory integration

## Repository Implementation Status

Implemented baseline:

- `docker-compose.yml` with `proxy`, `redis`, `api`, and `web` services
- `docker/api.Dockerfile`
- `docker/web.Dockerfile`
- `docker/nginx.conf` reverse-proxy routing for `/` and `/api`
- API requests allow up to 65 MiB at the proxy (`client_max_body_size 65m`), leaving multipart overhead above the API's existing 64 MiB per-file limit. This prevents Nginx's default 1 MiB body limit from rejecting wallpaper uploads before they reach the API.
- the API container exposes a Compose healthcheck on `/health`; the proxy waits for API health before startup
- external monitoring should call unauthenticated `/api/health`, which traverses the public reverse-proxy route to the API; container-local checks continue to use `/health`
- upstream API connection failures are normalized by nginx to a structured `503 API_UNAVAILABLE` response, distinct from authentication `401` responses
- validated backend config loader in `apps/api/src/config.ts`
- API deployment writer now targets the mounted SYSVOL path through local filesystem I/O instead of direct SMB library calls

Current limitation:

- Docker Compose now defines a named CIFS volume for SYSVOL, but target-environment validation still depends on Ubuntu host support for the Docker local volume driver with `type=cifs`
- production database is expected to be external and supplied through `.env`, not provisioned by Compose
- the Compose reverse-proxy baseline is now the public entrypoint, so API and web are intended to stay internal-only on the Docker network

## Container Access Model

After updating `docker/nginx.conf` on the deployment host, run `docker compose exec proxy nginx -t`. If validation succeeds, run `docker compose exec proxy nginx -s reload`, then retry the upload through the public application URL. The configuration is bind-mounted; no image rebuild is required for this change.

- public browser entrypoint: `proxy` on host port `9105`
- frontend container: internal-only `web:3001`
- backend container: internal-only `api:3000`
- Redis container: internal-only `redis:6379`

Operational note:

- browser traffic should use `http://<host>:9105`
- frontend API calls should use relative `/api` routing through the reverse proxy
- backend port `3000` should not be published to the host in the default deployment shape to avoid common host-port conflicts

## Required Environment Groups

### Database

Required keys observed in `.env`:

- `POSTGRES_URL`
- `POSTGRES_USERNAME`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`
- `POSTGRES_CREATE_DATABASE`
- `POSTGRES_SSL`
- `POSTGRES_SSL_REJECT_UNAUTHORIZED`

Usage notes:

- `POSTGRES_URL` should be treated as the primary connection string
- the application derives the final runtime URL from `POSTGRES_URL` and uses `POSTGRES_USERNAME` plus `POSTGRES_PASSWORD` as credential overrides when provided
- production deployment should connect to the existing PostgreSQL instance defined in `.env`
- Docker Compose in this repository does not start an internal PostgreSQL container for production use

### Domain / SMB Deployment

Required keys observed in `.env`:

- `DOMAIN_NAME`
- `DOMAIN_USERNAME`
- `DOMAIN_PASSWORD`
- `SHARED_FOLDER_PATH`
- `CIFS_SHARE_PATH`
- `CIFS_VERS`

Usage notes:

- `CIFS_SHARE_PATH` identifies the SYSVOL share root used by the Docker volume driver on the Ubuntu host
- `CIFS_VERS` is consumed by the Docker volume mount options and should match the server's supported SMB dialect
- `SHARED_FOLDER_PATH` must be the in-container mounted target path, for example `/app/sysvol/mbma.com/scripts`
- domain credentials are consumed by the Docker volume mount and should not be re-implemented in application code

### LDAP

Available keys observed in `.env`:

- `LDAP_URL`
- `LDAP_BIND_DN`
- `LDAP_BIND_PASSWORD`
- `LDAP_BASE_DN`

Usage notes:

- LDAP is not in MVP scope for authentication
- these keys may remain unused in Phase 1 and Phase 2, but should be preserved for later integration phases

## MVP Configuration Ownership

### Environment-Managed

- database credentials
- domain credentials
- LDAP bind credentials
- raw connection endpoints
- external PostgreSQL host selection

### UI-Editable Operational Settings

- SYSVOL target path
- wallpaper filename
- storage location
- scheduler interval
- deployment timeout
- retry attempts
- upload size limit
- allowed file extensions

## Security Handling Rules

- never copy secret values from `.env` into committed docs, code comments, or examples
- pass runtime secrets through environment variables or deployment secrets only
- avoid returning secret values from API settings endpoints
- audit settings changes, but redact secret material in logs

## Phase 1 Recommendation

- keep `.env` as the single operational source for bootstrap and secret configuration
- implement a validated config layer in the future backend so missing required keys fail fast
- separate UI-editable settings from bootstrap secrets in the data model and API

## Next Environment Tasks

- add env validation for optional versus mandatory keys per phase
- add secret rotation and operational runbook guidance
- document fallback local-development strategy if a standalone PostgreSQL container is ever needed outside production
- validate the Ubuntu Docker host can create the CIFS-backed `sysvol` volume with the current credentials and SMB version

## Assigned AD authentication — 2026-09-27

The user approved AD login with access and roles assigned only through Users. This supersedes earlier LDAP deferral notes. See `ad-login-contract.md` for credential/assignment boundaries, explicit AD/LOCAL source, objectGUID identity pinning, TLS/CA configuration, session revocation, additive schema deployment, and verification limitations. Existing accounts remain LOCAL until explicitly changed in Users.

LDAP certificate verification defaults to enabled. Per the owner-approved no-CA configuration (2026-09-27), set `LDAP_TLS_REJECT_UNAUTHORIZED=false` in the target server `.env` and recreate the API container after building the updated code. This option is LDAP-only; LDAPS/StartTLS encryption remains enabled. Local service bind/search passed with this setting; target-host user login acceptance remains separate.
