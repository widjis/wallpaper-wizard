# CWCM UX contract

## Scope and authority

Approved Wallpaper Library workflow, 2026-09-27, Phase 5. This contract complements the functional specification and OpenAPI; it does not alter campaign priority or Group Policy delivery. Existing English product labels and shared Radix components remain canonical. Changes below are local implementation requirements, not evidence of deployment acceptance.

## Permissions

| Operation                                                 | Administrator | Operator | Viewer |
| --------------------------------------------------------- | ------------- | -------- | ------ |
| Open Library, preview, download                           | Yes           | Yes      | No     |
| Upload, edit title/description, delete eligible wallpaper | Yes           | Yes      | No     |
| Create campaign from wallpaper                            | Yes           | Yes      | No     |
| Set default wallpaper                                     | Yes           | No       | No     |

Protected image reads remain available to authenticated viewers for dashboard/campaign displays. Server authorization enforces Library operations, default changes, settings writes, and campaign mutations; hiding controls is not an authorization boundary. Broader authorization outside this slice is not certified by these changes.

## Library navigation and state

- Cards expose Preview, Create campaign, and a labelled Actions menu. Menu actions: Set as default (Administrator only), Edit details, Download JPG, Delete wallpaper.
- A wallpaper already selected as default has a Default badge and a disabled default action. Default status can coexist with active/scheduled/draft usage.
- `Draft` describes a campaign, not an unused image. Wallpaper badges use Default, Active campaign, Scheduled, Used in draft, Past campaigns, or Unused.
- Unused means no associated campaign records and not the current default. Completed/cancelled campaign references are retained and shown as past use.
- Search covers title, filename, description; a clear button restores focus. Explicit filters: All, Default, Active campaign, Scheduled, Unused. Sort: newest, name ascending, largest. Committed search/filter/sort are represented in the URL.
- Empty Library invites upload; empty search offers clear filters. List and image failures have retry controls and are not presented as indefinite loading.

## Create campaign

From card or detail, navigate to `/campaigns?wallpaperId=...`, open the existing form with that wallpaper selected and its title as the editable campaign name. Do not create any record until the user submits. Consume the parameter after initialization so refresh/refetch cannot reset edits. Missing/deleted wallpaper yields a visible explanation. Campaign references navigate with `campaignId` and locate the campaign in the existing list.

## Default wallpaper

Show an image confirmation explaining that the wallpaper is used when no campaign is active. Saving changes only `defaultWallpaperId`, records an audit event, refreshes Library/settings/dashboard caches, and does not overwrite unrelated settings. An active campaign remains unchanged; scheduler eligibility and Group Policy delivery still apply. No Apply now action is added.

## Details and deletion

Detail dialog shows final JPG, title/description, upload time/uploader, size/resolution, independent statuses, and every associated campaign with status, date range, and navigation.

Edit details changes title/description only; source filename, normalized bytes, and existing campaign references stay unchanged. Title is trimmed, required, maximum 200 characters; description maximum 2000. Errors preserve edits, pending saves prevent duplicate actions, and dismissing dirty edits asks whether to discard. In-app navigation uses an app-owned leave confirmation; page unload uses the browser lifecycle warning.

Default wallpapers and wallpapers referenced by DRAFT/SCHEDULED/ACTIVE campaigns cannot be deleted. The UI explains the reason and offers Review wallpaper. The backend rechecks at mutation time and rejects stale requests; deletion/default transactions use serializable isolation. Completed/cancelled campaign history is retained. Eligible deletion requires named confirmation and retains inline failure feedback.

## Upload

1. Choose one non-empty JPG/PNG, maximum 64 MiB (existing API file limit; proxy is 65 MiB for multipart overhead).
2. Request a server-generated 1920x1080 centre-cropped JPG preview. This request creates no wallpaper/database record. Inform the user to check logos/text at the edges.
3. Enter title and optional description; save only after preview succeeds.
4. Save the original file and metadata using the same deterministic normalization pipeline. The preview and persisted image bytes must match.
5. Open saved wallpaper details with Create campaign and Administrator default actions. Saving to Library never schedules or publishes a wallpaper.

Loading communicates upload/processing without an invented percentage. Retry preserves the file and text. Invalid/corrupt/oversized images have actionable errors; 413 includes a proxy-limit explanation. Cancel before save leaves no Library record. Prevent closing during processing/save and confirm discarding a selected file. Revoke preview object URLs when replaced/closed/unmounted.

The legacy Settings upload-size field is not newly enforced by this slice; the actual API ceiling remains 64 MiB and is what the Library displays. Unifying configurable settings with transport limits is a separate tracked gap.

## Verification and acceptance

- Route tests use Fastify injection and an isolated repository double: role denials, invalid inputs, missing default target, blocked deletion, no preview persistence, exact preview/save bytes.
- Browser checks intercept API calls with fixtures: campaign preselection with no automatic write, role-specific controls, default confirmation, editing, preview-before-save, protected deletion, search and responsive layouts.
- Build/typecheck/lint and diff checks are required. Fixture tests do not certify the deployed database, reverse proxy, scheduler, SYSVOL, or endpoint delivery.
- Deployment acceptance: build/restart the server containers, sign in as Administrator and Operator, repeat the workflow with a controlled image, and confirm audit events/default selection on the target environment.

## Canonical UI resolution

| Capability     | Canonical owner                               | Variant and verification                                                       |
| -------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| Select/Listbox | components/ui/select.tsx                      | Radix authored popup for Library filters/sort; keyboard checks in browser      |
| Forms          | Input, Label, Textarea + server detailsSchema | Create/edit with noValidate, bounded strings, inline errors and pending guards |
| Dialogs        | Dialog / AlertDialog                          | Detail/edit/upload and named default/delete/discard confirmation               |
| Scrollbar      | styles.css and browser overflow               | Scrollable max-height dialogs; no screen-specific scrollbar styling            |
| Toast          | shared Sonner Toaster                         | Success acknowledgement; inline errors retain recovery details                 |
| CRUD           | Library route + wallpaper-routes/repository   | Stay in detail after create/edit; refresh affected queries after mutations     |

Reproduce locally: `npm run test:wallpapers`; start `npm run dev -w @cwcm/web -- --host 127.0.0.1 --port 4180`, then run `npm run test:wallpapers:ui` with Python Playwright/Chromium available. Browser checks use intercepted fixtures, never production writes.

## Assigned AD login and Users

The approved authentication/access workflow is defined by `docs/ad-login-contract.md`: AD credentials, portal-assigned role/status, explicit AD/LOCAL source, no automatic enrollment, no password field for AD assignments, confirmation of access changes, and retention of local recovery access. Login and Users reuse the existing Input/Label/Select/AlertDialog controls and inline errors.
