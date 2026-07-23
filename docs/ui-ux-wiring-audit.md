# UI UX Wiring Audit

## Purpose

Map each web menu to its current backend wiring status and record the resolution of the UI cleanup backlog.

## Audit Scope

- frontend routes under `apps/web/src/routes`
- navigation shell in `apps/web/src/components/app-layout.tsx`
- frontend API wrapper in `apps/web/src/lib/api.ts`
- backend routes in `apps/api/src/main.ts`
- shared response contracts in `packages/types/src/index.ts`

Audit date: 2026-07-23
Resolution update: 2026-07-23

## Route And Menu Map

| Menu / Screen     | Route         | Frontend file                        | Backend endpoint(s)                                                                                                                                                                                                                                                            | Status | Current finding                                                                                                                                                             | Next implementation slice                                                  |
| ----------------- | ------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Dashboard         | `/`           | `apps/web/src/routes/index.tsx`      | `GET /api/dashboard/summary`, `GET /api/campaigns`                                                                                                                                                                                                                             | Live   | Dashboard cards, upcoming list, preview image, deployment donut, CTA, and empty states now derive from live API data instead of fallback samples.                           | Keep optimizing performance and optionally add richer campaign drill-down. |
| Wallpaper Library | `/wallpapers` | `apps/web/src/routes/wallpapers.tsx` | `GET /api/wallpapers`, `POST /api/wallpapers`, `DELETE /api/wallpapers/:wallpaperId`, `GET /api/wallpapers/:wallpaperId/image`                                                                                                                                                 | Live   | Mock cards were removed, search and usage filter are wired client-side, download uses configured API base, and non-authorized roles see an access-denied state.             | Add advanced filters only if product scope expands.                        |
| Campaigns         | `/campaigns`  | `apps/web/src/routes/campaigns.tsx`  | `GET /api/campaigns`, `POST /api/campaigns`, `PATCH /api/campaigns/:campaignId`, `DELETE /api/campaigns/:campaignId`, `POST /api/campaigns/:campaignId/duplicate`, `POST /api/campaigns/:campaignId/activate`, `POST /api/campaigns/:campaignId/cancel`, `GET /api/wallpapers` | Live   | Debug telemetry was removed and mutation actions are now role-aware while read access remains available for Viewer.                                                         | Consider server-side filtering only if dataset size grows.                 |
| Timeline & Queue  | `/timeline`   | `apps/web/src/routes/timeline.tsx`   | `GET /api/queue`, `POST /api/queue/pause`, `POST /api/queue/resume`, `POST /api/queue/reorder`, `DELETE /api/queue/:campaignId`, `POST /api/deployments/force`                                                                                                                 | Live   | Queue fallback rows were removed, authenticated previews are loaded from protected wallpaper endpoints, force deploy is a global action, and unauthorized roles are denied. | Add richer queue metadata only if backend exposes it later.                |
| Deployment        | `/deployment` | `apps/web/src/routes/deployment.tsx` | `GET /api/deployments`, `GET /api/settings`, `POST /api/deployments/:deploymentId/verify`, `POST /api/deployments/force`                                                                                                                                                       | Live   | Deployment detail panel now shows live wallpaper, target path, filename, verification fields, and step status derived from real deployment data.                            | Final end-to-end SYSVOL validation remains environment-dependent.          |
| History & Audit   | `/history`    | `apps/web/src/routes/history.tsx`    | `GET /api/deployments`, `GET /api/activity`                                                                                                                                                                                                                                    | Live   | Deployment history and activity audit are both rendered from live API responses with explicit loading, empty, and error states.                                             | Expand export behavior if audit export becomes a product requirement.      |
| Users             | `/users`      | `apps/web/src/routes/users.tsx`      | `GET /api/users`, `POST /api/users`, `PATCH /api/users/:userId`, `DELETE /api/users/:userId`                                                                                                                                                                                   | Live   | Mock rows and synthetic email presentation were removed; admin CRUD is live and non-admin access is denied at route level.                                                  | Add real email only if the backend contract requires it later.             |
| Settings          | `/settings`   | `apps/web/src/routes/settings.tsx`   | `GET /api/settings`, `PUT /api/settings`                                                                                                                                                                                                                                       | Live   | Settings remain fully wired and now also enforce read-only behavior for non-admin roles.                                                                                    | Add stricter field validation if needed.                                   |
| Login             | `/login`      | `apps/web/src/routes/login.tsx`      | `POST /api/auth/login`, `POST /api/auth/logout`                                                                                                                                                                                                                                | Live   | Login and logout flows are wired and protected routing exists through the auth provider.                                                                                    | Add role-specific landing behavior only if product scope requires it.      |

## Cross-Cutting Shell Findings

| Area                            | File                                                          | Status | Finding                                                                           | Next implementation slice                                   |
| ------------------------------- | ------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Sidebar navigation              | `apps/web/src/components/app-layout.tsx`                      | Live   | Navigation items now reflect user role capability and hide unavailable modules.   | Keep synchronized if new modules or roles are added.        |
| Header notification bell        | `apps/web/src/components/app-layout.tsx`                      | Closed | Hardcoded notification affordance was removed to avoid a misleading UI signal.    | Reintroduce only when backed by a real notification source. |
| Header help button              | `apps/web/src/components/app-layout.tsx`                      | Closed | Unwired help affordance was removed from the header.                              | Reintroduce only with a real runbook or help destination.   |
| Footer version and domain badge | `apps/web/src/components/app-layout.tsx`                      | Closed | Hardcoded environment badge and static version label were removed from the shell. | Reintroduce only when sourced from runtime configuration.   |
| Auth gate                       | `apps/web/src/routes/__root.tsx`, `apps/web/src/lib/auth.tsx` | Live   | Auth hydration and redirect handling remain stable for protected routes.          | Extend only when session-expiry UX is implemented.          |

## Detailed Findings By Screen

### Dashboard

- upcoming cards now derive from scheduled campaign rows.
- the current wallpaper preview now resolves through authenticated image loading.
- deployment donut values now come from live `deploymentStats`.
- `View Campaign` now navigates to the campaigns screen.
- empty states are explicit instead of silently using fallback sample content.

### Wallpaper Library

- upload, delete, preview, and download are implemented for live rows.
- mock wallpaper fallback was removed.
- search and usage filtering are wired in the route.
- downloads now reuse configured API base URL.
- unauthorized roles see an access-denied state instead of functional controls.

### Campaigns

- no local mock campaign rows remain; table rendering is driven by live API data.
- search, status filter, and priority filter work on the loaded client-side dataset.
- debug telemetry to `http://127.0.0.1:7777` was removed.
- Viewer now gets read-only access while mutation controls are restricted to Administrator and Operator.

### Timeline & Queue

- queue state and queue items come from the backend.
- fallback queue content was removed in favor of loading, empty, and error states.
- force deploy now appears as a global queue action.
- queue thumbnails are loaded through authenticated preview fetches instead of local placeholder assets.

### Deployment

- latest deployment, verify action, and force redeploy are wired to live API calls.
- deployment steps now reflect actual deployment and verification fields.
- the preview image is loaded from the deployed wallpaper.
- target path and filename are shown from live deployment detail or live settings.

### History & Audit

- the page now renders both deployment history and activity audit from live endpoints.
- fallback sample rows were removed.
- CSV export still targets deployment rows only, which now matches the deployment history section explicitly.

### Users

- user create, edit, and delete operations are wired to the backend.
- sample user fallback was removed.
- synthetic email presentation was removed because it was not backed by the contract.
- non-admin access is denied at the route level.

### Settings

- the page uses live `GET /api/settings` and `PUT /api/settings`.
- there is no local mock dataset.
- residual UX work is validation, guardrails, and permission enforcement rather than endpoint wiring.

## Wiring Verdict

- Backend coverage exists for all main menus represented in the current UI.
- Frontend wiring is now mock-free for the main operator and administrator routes covered by this audit.
- Remaining release risk is no longer residual mock UI; it is environment-dependent deployment validation and broader production hardening.

## Recommended Execution Order

1. Preserve route-level RBAC consistency as new modules are added.
2. Re-run browser verification whenever deployment, auth, or navigation behavior changes.
3. Keep `docs/openapi.yaml` synchronized when deployment or campaign response shapes change again.
