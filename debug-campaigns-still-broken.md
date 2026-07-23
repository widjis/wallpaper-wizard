# Debug Session: campaigns-still-broken
- **Status**: [OPEN]
- **Issue**: Halaman `http://localhost:8080/campaigns` masih dianggap belum jalan dari sisi user
- **Debug Server**: pending
- **Log File**: `.dbg/trae-debug-log-campaigns-still-broken.ndjson`

## Reproduction Steps
1. Buka `http://localhost:8080/campaigns`
2. Coba aksi utama campaign
3. Catat aksi mana yang tidak bereaksi atau gagal

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Klik aksi campaign tidak benar-benar memicu handler UI | High | Low | Pending |
| B | Mutation berjalan tetapi gagal di network/API validation | High | Medium | Pending |
| C | Dropdown atau dialog action campaign tidak stabil di runtime | High | Medium | Pending |
| D | Invalidate/refetch mengembalikan state sehingga user merasa aksi gagal | Medium | Medium | Pending |
| E | Ada exception browser spesifik halaman campaign yang memutus flow | Medium | Medium | Pending |

## Log Evidence
- Browser reproduction confirmed the page previously rendered fallback mock rows instead of only live campaign rows.
- Because mock rows have no real `id`, search and filter appeared broken and row actions like edit / delete became no-op in runtime.
- Browser retest after the patch now shows explicit empty states instead of mock data:
  - `No campaigns found yet. Create your first campaign from the button above.`
  - `No campaigns match the current search or filters.`
- Browser retest also confirmed the create form now surfaces wallpaper availability honestly:
  - wallpaper selector shows `No wallpapers available`
  - helper text shows `Upload at least one wallpaper before creating a campaign.`
  - save action stays disabled until required live inputs exist

## Verification Conclusion
- Confirmed root cause: fallback static rows in `apps/web/src/routes/campaigns.tsx` made `/campaigns` look interactive while not being wired to live records.
- Implemented fix:
  - removed static fallback campaign rows
  - replaced broken dropdown-only actions with visible action buttons on live rows
  - added honest loading / error / empty states for campaigns
  - added honest wallpaper empty/error state in the campaign form
  - disabled submit until required live values are present
- Current limitation:
  - edit / delete could not be browser-verified end-to-end after the patch because the active runtime returned zero live campaigns and zero wallpapers for the authenticated session
