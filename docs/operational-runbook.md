# Operational Runbook

## Purpose

Provide the minimum operating procedure for deploying, validating, and rolling back the CWCM MVP foundation.

## Deployment Steps

1. Ensure `.env` contains valid production values for:
   - PostgreSQL external connectivity
   - Redis host and port
   - SMB / SYSVOL credentials and target path
2. Ensure the Ubuntu Docker host has CIFS support available for the Docker local volume driver
3. Start runtime services through Docker Compose or the selected process supervisor
4. Access the application through the reverse proxy entrypoint on host port `9105`
5. If the database is not prepared yet, run:
   - `npm install`
   - `npm run db:prepare`
   - `npm run prisma:push`
   - `npm run build:api`
   - `npm run build:web`

## Validation Steps

1. Open the web login page through `http://<host>:9105`
2. Authenticate with a valid local user
3. Confirm dashboard data loads
4. Upload a wallpaper
5. Create a campaign from the web UI
6. Edit the campaign and confirm the update persists after list refresh
7. Pause and resume the queue from the web UI
8. Save a settings change and confirm the updated value reloads
9. Trigger manual deployment
10. Trigger deployment verification
11. Confirm deployment history and activity log entries exist

## Rollback Baseline

If a release must be rolled back:

1. Stop the new API and web processes
2. Redeploy the previous known-good web and API images or artifacts
3. Restore the previous application configuration if changed
4. Confirm the external PostgreSQL schema remains compatible before bringing the previous API build back online
5. Re-run login, dashboard, and deployment smoke checks

## Current Known Blockers

- dashboard and settings response baselines in this workspace are still slightly above the PRD target of `< 2 seconds`
- SYSVOL verification now depends on successful creation of the CIFS-backed Docker volume on the Ubuntu host; this must be validated in the target environment before the blocker can be closed

## Operator Notes

- Do not commit secret values into repository docs
- Keep SYSVOL deployment verification limited to controlled test assets until the environment is confirmed stable
- Revalidate Docker CIFS mount access whenever domain credentials, SMB version, or target paths change
- if deployment verification returns `FAILED`, review the stored deployment message before retrying so transport and share issues are visible to operators
- in the default Compose topology, `api` and `web` are internal-only services and should be reached through the proxy rather than direct host-port access
- the API container now expects `/app/sysvol` to be backed by the `sysvol` Docker volume, not by application-level SMB client code
- if `proxy` returns `502` after an `api` or `web` container recreation, verify whether `nginx` is still targeting a stale container IP; the repository now uses Docker DNS re-resolution through `127.0.0.11` to reduce this risk
