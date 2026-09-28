# Wallpaper Library verification — 2026-09-27

## Delivered slice

Phase 5: image-led Library actions, default selection, campaign preselection, usage details, metadata editing, normalized preview-before-save, explicit filters/sort, role enforcement, protected deletion, and recoverable loading/error states. Behavioral authority: `../UX-CONTRACT.md`; API authority: `openapi.yaml`; visual ownership: `../DESIGN.md`.

## Local evidence

- `npm run build`: web production build and API TypeScript build passed. API build repeated after the deleted-wallpaper campaign guard.
- `npx tsc --noEmit -p apps/web/tsconfig.json`: passed.
- `npm run lint`: passed with seven existing React fast-refresh warnings and no errors. Existing formatting errors in deployment/history routes were corrected without behavioral changes.
- `npm run test:wallpapers`: nine tests passed. Fastify injected requests and repository/transaction doubles; no test writes to the configured database.
- `npm run test:wallpapers:ui` (local Vite at 127.0.0.1:4180): Administrator and Operator browser flows passed with all API requests intercepted by fixtures. Covers campaign preselection with no automatic persistence, default role visibility/confirmation, metadata edit, default deletion protection, preview-before-save, 413 explanation/retry, search/clear, keyboard filter selection, image failure/retry, and no horizontal overflow at 390px.
- Desktop (1365px) and mobile (390px) screenshots reviewed. The shared shell now uses wrapping navigation on mobile rather than consuming most of the viewport with a fixed desktop sidebar.
- An existing duplicate `/health` entry was consolidated. OpenAPI YAML parsed with duplicate-key rejection and all internal references resolved; `git diff --check` passed.

## Backend challenges

1. Operator cannot set default; Viewer cannot list or mutate Library resources.
2. Administrator default selection succeeds; missing target returns 404.
3. Preview creates no records; normalized bytes match subsequent persisted upload bytes exactly (including portrait-to-16:9 conversion).
4. Corrupt images, blank titles and excessive descriptions are rejected without persistence; valid metadata editing and deletion rejection remain explicit.
5. Multipart limit returns 413 before persistence.
6. Renamed SVG is rejected despite a PNG filename.
7. Default selection updates only defaultWallpaperId and records the acting user in the audit event.
8. Default and ongoing-campaign deletion guards run before writes; eligible deletion records both tombstone and audit.
9. Campaign creation rejects a soft-deleted wallpaper from stale Library data. Update campaign uses the same deleted-image check.

## Runtime limits and deployment acceptance

No production API/database mutations, SYSVOL writes, or scheduler runs were performed for this change. No schema migration is required. No claim is made about applied endpoint wallpapers.

After synchronizing this source onto the deployment host, rebuild/restart using `docker compose up -d --build`. Check `/api/health`; sign in as Administrator and Operator and repeat Library upload, default choice and campaign preselection using a controlled image. Verify the saved metadata/default and corresponding audit events. Confirm existing campaigns remain unchanged when selecting a fallback. The deployment checklist remains open in the roadmap until target-host evidence exists.

Remaining tracked gaps: unify the legacy configurable upload-size setting with the actual 64 MiB transport limit, and complete RBAC review outside this Library/settings-write/campaign-mutation slice.
