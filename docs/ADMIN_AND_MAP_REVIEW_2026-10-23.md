# Administration dashboard and shared map dock

The reported `/api/admin/dashboard` schema mismatch was reproduced in the actual
response producer: PostgreSQL adds two `COUNT(*)` values as bigint, and the
standard pg int8 parser returns text. The strict dashboard schema requires a
nonnegative integer. The beacon aggregate now casts to integer, consistently
with neighboring count queries. The schema remains strict; database failures
still propagate instead of producing a zero dashboard.

The administrator shell no longer adds a second fixed display-mode/bell group.
The existing administrator header owns one display control and its notification
bell; its action row can wrap without overlapping the brand or Back to app.

The map uses the existing mobile bottom toolbar at desktop widths too: six tool
groups and Hide, with a context panel above it and clearance for navigation and
scale controls. Mobile retains its full-width panel; desktop keeps a 380px panel.
The source map opens collapsed. No geometry, projection or saved drawing change
is part of this layout repair.

## Evidence

- Initial source runtime check: `npm run docker:verify` passed the existing
  production application/supporting stack and single-application inventory.
  This was a read-only check, not promotion of these source changes.
- Combined focused Jest run: 20 suites / 162 tests passed. It covers dashboard
  response/layout/page/metrics/operations/feedback, map search/CRS/GPS/basemap/
  print/export/pan locking, and the separately approved online transform repair.
- After typed test-fixture lint corrections, the three affected API/service
  suites passed another 48 tests. Scoped ESLint passed after the corrections.
- A native read-only query in exact rehearsal container
  `ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0`
  verified its synthetic database marker and returned `bigint|integer` for the
  old and repaired beacon aggregate types. No database rows were modified.
- CUA on the existing source preview verified the bottom toolbar on desktop
  (1280x800) and phone (390x844), Compute and Layers panels, Close, Escape and
  Hide. Neither viewport had horizontal overflow. At desktop the panel bounds
  were x8..388, y199..669 and toolbar y724..779. At phone width the toolbar
  bounds were y688..743 and mobile navigation y769..832; they did not overlap.
  Temporary viewport overrides were reset.
- Evidence in ignored `.cache/page-review/`: `map-desktop.png`, `map-mobile.png`
  and `map-mobile-metrics.json`. These are actual CUA captures; existing
  simulated map geometry was retained and not treated as field evidence.
- `npm run security:gate` passed: 119 applied migration pins, API/PWA guards,
  632 test files and 3097 source files scanned. No migration changed here.

## Remaining acceptance

The browser had no valid administrator session. Navigating to `/admin` reached
the sign-in flow; the dashboard's signed-in native HTTP/browser acceptance is
still required. Route unit tests isolate the authentication/database boundary;
they are not ordinary-account HTTP proof. Header behavior is covered by the
mounted shell/layout regression, not a signed-in screenshot.

An initial strict app/test typecheck passed. A later run overlapped separate
observation-batch work and reported TS2349 at lines 340 and 373; that file is
outside this repair's commit scope. After that concurrent query adapter changed,
the final `npm run typecheck` passed both application and test typing.
Native unauthenticated GET probes returned 401 for `/api/admin/dashboard`,
`/api/coordinates/transform` and `/api/coordinates/batch`; these prove denial,
not successful administrator or ordinary-user access.

The subsequent ordinary-account native HTTP pass signed in normally and received
403 from `/api/admin/dashboard`, confirming the privilege boundary. It did not
grant admin access or establish successful administrator dashboard rendering.
See `ORDINARY_API_ACCEPTANCE_2026-10-23.md` for native evidence and the subsequently
approved, independently verified synthetic credential cleanup.

The existing source preview was restarted using its unchanged loopback-only
synthetic configuration after connection refusal was confirmed. An initial
sandbox launch was unreachable and its exact inspected process tree was stopped
before relaunching with host access. No duplicate preview/container, production
restart, account reactivation or browser-storage injection was performed.

Source verification does not establish production, payment/provider, recovery,
receiver or field acceptance. The full platform goal remains open.
