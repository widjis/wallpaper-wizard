# Operational Runbook

## Purpose

Provide the minimum operating procedure for deploying, validating, and rolling back the CWCM MVP foundation.

## Deployment Steps

1. Ensure `.env` contains valid production values for:
   - PostgreSQL external connectivity
   - Redis host and port
   - SMB / SYSVOL credentials and target path
2. Run `npm install`
3. Run `npm run db:prepare`
4. Run `npm run prisma:push`
5. Run `npm run build:api`
6. Run `npm run build:web`
7. Start runtime services through Docker Compose or the selected process supervisor

## Validation Steps

1. Open the web login page
2. Authenticate with a valid local user
3. Confirm dashboard data loads
4. Upload a wallpaper
5. Create a campaign from the web UI
6. Trigger manual deployment
7. Trigger deployment verification
8. Confirm deployment history and activity log entries exist

## Rollback Baseline

If a release must be rolled back:

1. Stop the new API and web processes
2. Redeploy the previous known-good web and API images or artifacts
3. Restore the previous application configuration if changed
4. Confirm the external PostgreSQL schema remains compatible before bringing the previous API build back online
5. Re-run login, dashboard, and deployment smoke checks

## Current Known Blocker

- The latest repository version is ready for schema application, but `npm run prisma:push` currently fails with Prisma error `P1000` because the external PostgreSQL credentials resolved from `.env` are rejected by the target server.

## Operator Notes

- Do not commit secret values into repository docs
- Keep SYSVOL deployment verification limited to controlled test assets until the environment is confirmed stable
- Revalidate SMB access whenever domain credentials or target paths change
