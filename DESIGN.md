---
version: alpha
name: CWCM
description: Corporate wallpaper operations with image-led previews and explicit publication states.
colors:
  primary: "oklch(0.56 0.19 259)"
  background: "oklch(0.985 0.003 250)"
  foreground: "oklch(0.18 0.03 260)"
  card: "oklch(1 0 0)"
rounded:
  base: "0.625rem"
omitted:
  - section: typography
    reason: Existing application font stack remains owned by styles.css and Tailwind defaults.
  - section: spacing
    reason: Existing Tailwind utilities remain the spacing source; no token redesign in this slice.
  - section: components
    reason: Canonical component implementations live in apps/web/src/components/ui.
---

# CWCM design context

CWCM is an operational product for corporate IT to prepare and schedule wallpaper publication through SYSVOL. Preserve the existing blue primary, neutral surfaces, semantic status colors, Lucide icons, and Radix-based controls. This is an administration tool, not a marketing page. English UI remains the existing product language; dates follow the browser locale with campaign timezone retained by the campaign workflow.

The wallpaper itself is the visual anchor: full 16:9 previews, readable titles, and quiet adjacent controls. Cards carry Preview and Create campaign; supplementary actions use the canonical DropdownMenu. Default and campaign status are independent badges. Do not imply endpoint delivery from a successful SYSVOL write.

## Ownership and reuse

- Canonical tokens: `apps/web/src/styles.css` (`:root` / `.dark` → `@theme inline` → Tailwind classes). Values above mirror those definitions; do not introduce separate token copies.
- Controls: existing `components/ui/{button,input,textarea,select,dialog,alert-dialog,dropdown-menu,badge}.tsx`.
- App shell: `components/app-layout.tsx`; sidebar on desktop, wrapping navigation on narrow screens.
- Protected wallpaper rendering: `components/wallpaper-image.tsx`; authenticated fetch, loading/failure/retry, URL cleanup, no unauthenticated fallback.
- Workflow and role rules: `UX-CONTRACT.md`, `docs/functional-specification.md`, `docs/openapi.yaml`.

Use labelled controls, visible keyboard focus, text with status colors, contained image previews, scrollable dialogs, and inline recoverable errors. Preserve motion restraint and responsive layout. No new component library or visual rebrand is introduced.
