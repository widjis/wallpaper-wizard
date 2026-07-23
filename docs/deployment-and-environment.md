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
- validated backend config loader in `apps/api/src/config.ts`
- API deployment writer now targets the mounted SYSVOL path through local filesystem I/O instead of direct SMB library calls

Current limitation:

- Docker Compose now defines a named CIFS volume for SYSVOL, but target-environment validation still depends on Ubuntu host support for the Docker local volume driver with `type=cifs`
- production database is expected to be external and supplied through `.env`, not provisioned by Compose
- the Compose reverse-proxy baseline is now the public entrypoint, so API and web are intended to stay internal-only on the Docker network

## Container Access Model

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
