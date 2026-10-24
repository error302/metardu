# Saved map drawing integrity — 24 October 2026

This milestone repairs the global map's linked-project drawing workflow in source.
It is not a production promotion, a cadastral survey, an instrument acceptance
test, or evidence that the broader engineering platform is finished.

## Verified defects and resulting behavior

- Saved `boundary_data.drawnFeatures` were not reopened in the global map.
  Linked projects now load their own complete drawing. Their browser recovery
  records are scoped to the authenticated viewer and project; the unlinked
  `metardu-map-features` record and CAD training drawing are not loaded or rewritten.
- Vertex editing previously wrote a stale whole boundary object and ignored the
  update error. Save appended loaded geometry again and could erase concurrent
  CAD/control edits. Editing now remains local until an explicit, version-checked
  save. Save replaces the drawing collection, not unrelated project evidence.
- A new private `/api/project/[id]/map-drawing` endpoint binds the version to the
  owner, exact drawing and coordinate metadata, and the project reference. The
  write checks the expected signed-in account, takes the existing project advisory
  lock, locks the reference and project rows, then checks ownership/version again.
  It validates the exact returned row before commit and discards a connection if
  rollback fails. Stale versions return 409 without overwriting either operator.
  Generic project boundary replacement through `/api/db` is refused.
- Reload archives a different local drawing before replacing it. A retained draft
  can be downloaded or merged for review. The merge adds exact nonduplicate
  features; it does not resolve overlapping or conflicting versions automatically.
  A malformed browser record is preserved and downloadable. Failure to cache is
  visible rather than silently deleting the original record.
- GeoJSON feature IDs, including zero, duplicates and missing IDs, exact unedited
  coordinates, nested properties and supported multi/collection geometries survive
  reopening and undo/redo. Unique internal OpenLayers IDs prevent source-ID
  collisions from dropping imported features. Original collection order survives
  OpenLayers spatial-index reordering. Collection metadata is retained; a bounding
  box is removed when edits make it stale.
- Native display circles retain their EPSG:3857 center/radius in the explicit
  `metarduDisplayGeometry` GeoJSON foreign member, with `geometry: null`. They are
  sketches, not projected survey-circle definitions, and do not receive fabricated
  survey area/length metrics.
- Map metrics are computed by the server and shared client engine. Polygon area
  subtracts holes, boundary length includes all rings, and multi-lines, multi-polygons
  and geometry collections include every supported member. Missing/unsupported
  grids, invalid topology, display circles or computation limits yield unavailable
  metrics with null numeric fields and a reason. Geometry remains retained.
- Linked drawing status provides direct Save, reload and recovery downloads.
  Responsive status placement clears the collapsed tools and navigation controls;
  expanded details scroll within the available map. Notification text has readable
  foreground/background pairs and bounded width. General status messages no longer
  appear as green success solely because they lack an `Error` prefix.

## Calculation and format boundaries

The known synthetic rectangle is 100 × 50 m with a 20 × 10 m hole: **4,800 m²**
and **360 m** of polygon boundary. Adding a 3–4–5 m line gives **365 m** total
boundary/line length. Northern and southern UTM fixtures test another two grids.
These are planar grid estimates. Independent feature areas are summed, including
overlaps between separate features; they are not a polygon union, ground-distance
correction, legal parcel area or proof of measurement accuracy.

Structural limits are 5,000 features, 4 MiB save payload, eight nested geometry
levels and 100,000 positions per geometry. Numeric measurement is bounded to
2,000 vertices per drawing to limit quadratic topology checks. A structurally
retained drawing beyond that measurement budget receives no numeric metrics.
Unknown stored drawing CRS fails closed and offers the original download. The
historical `source: map-drawing` writer's absent coordinate label is recognized as
legacy WGS84 GeoJSON; other unidentified coordinate data is not guessed.

Canonical JSON now hashes reserved `__proto__` metadata as ordinary data. Normal
hashes retain their existing convention; an old hash that omitted that particular
reserved member may differ. This does not rewrite stored records or migration
hashes. Existing consumers of historical evidence hashes still require release
compatibility review.

## Evidence

| Layer | Observed result | Limit |
| --- | --- | --- |
| Focused source tests | 10 suites, 71 tests passed; real OpenLayers round trips, React recovery behavior, API failures, quota/proxy admission and geometry metrics | Focused regression coverage, not every platform feature |
| Type checks | `npm run typecheck` passed for app and tests | Does not prove rendering or live deployment |
| Lint | Changed production modules and drawing/history tests passed scoped ESLint; adjacent creation/proxy tests also passed | Scoped lint, not a whole-checkout baseline claim |
| Security/migration gate | Passed with 119 applied migrations pinned; generic database and PWA guards checked | No unavailable Gitleaks or remote CI result is implied |
| PostgreSQL drawing verifier | 19 checks passed using actual handler modules in an owned temporary schema | Authentication/rate/RLS adapters are bounded; not production HTTP proof |
| PostgreSQL creation verifier | 8 checks passed after server-computed metrics integration | Separate temporary schema, synthetic data only |
| Ordinary browser session | Existing reserved-domain synthetic account, 127.0.0.1:3021: reopen two features, draw/save a third, reload, retain a fourth local feature through a competing remote edit, refuse stale save, reload/archive/merge/review/save five features, reopen five | Source preview only; competitor injected by the admitted fixture helper |
| Responsive browser | Desktop and 390 × 844 breakpoint inspected; no horizontal document overflow, recovery panel stayed inside the viewport | Computer browser emulation, no phone/GPS/instrument proof |
| Preservation | Exact temporary browser project removed; six original-table fingerprints and 120-entry synthetic migration ledger unchanged | Browser recovery copies for the marked synthetic project may remain; no page-storage internals were injected or erased |

Local receipts: `.cache/map-drawing/jest.json`, `native.json`, `eslint-final.json`,
`eslint-adjacent.json`, and `browser/fixture.json`. Browser screenshots include
`conflict-desktop.png`, `recovered-desktop.png`, `final-desktop.png`,
`final-mobile.png` and `final-mobile-collapsed.png`. The earlier mobile screenshot
attempt timed out; subsequent direct screenshot capture succeeded. The temporary
viewport override was reset and the owned rehearsal tab closed.

Reproduce native checks with `node scripts/verify-map-drawing.mjs` and
`node scripts/verify-project-creation.mjs`. Both admit only the exact labeled
loopback synthetic rehearsal container/database, create marked temporary schemas,
and check original-record preservation before reporting success. The browser
fixture helper supports `--inspect` without writes and `--hold` with explicit
`snapshot`, `remote-edit`, and `cleanup` commands; it changes no authentication,
subscription, DNS or production data.

## Live, release and external dependencies

At **2026-10-24 09:20:52 UTC**, the origin and public homepage, pricing, login and
health endpoint all returned HTTP 200. Public health reported database/Redis OK
and **releaseId unknown**. The read-only Docker verifier passed against the one
existing `metardu-app` stack and its required supporting services. The latest
backup completed **2026-10-24 02:00:04 UTC**; this is archive/header evidence,
not a verified restore. Approved Cloudflared automatic recovery remains enabled.
These observations do not prove continuous availability, Windows reboot recovery,
independent hosting or promotion of this source.

No production build, migration, service replacement or push is part of this
milestone. Coordinate/reference, payment, terrain and other concurrent source
changes remain preserved in the checkout. Promotion requires one reviewed source
snapshot, migration compatibility, recovery evidence and the verified rollback
image. No new migration is required by this map change. The shared uncommitted
surface migration remains outside this milestone.

Live payment/webhook/entitlement and email delivery acceptance remain provider
gates. The user's deferred signing-key rotation and computer-browser-only test
preference remain in force. ChatGPT linking retains its notice, deployment and
human-consent gates. No physical property boundary, exact home location, field
control, GNSS receiver or legally usable survey is inferred from these fixtures.

Next source audits include retained-sketch behavior in project-specific map paths,
legacy creation helpers/inactive onboarding, and exports whose unsupported
geometry or coordinate errors may still be skipped. This repair does not certify
all CAD, KML, WKT, LandXML, PDF or statutory deliverables.

See `PROJECT_CREATION_INTEGRITY_2026-10-24.md`,
`PROJECT_SETTINGS_INTEGRITY_2026-10-23.md`, `CREDIBILITY_ACCEPTANCE.md`, and
`PUBLIC_AVAILABILITY_2026-10-23.md` for the broader acceptance register.
