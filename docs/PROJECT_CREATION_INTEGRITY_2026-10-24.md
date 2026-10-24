# Quota-checked creation and retained map sketches — 24 October 2026

## Verified defects and changes

Two normal creation paths had different admission rules: the project form used
`POST /api/projects`, while the general map used a generic project insert that
bypassed that endpoint's plan check. Concurrent requests to the canonical route
also checked usage before a separate insert. Scheme creation used a compensating
DELETE if its second insert threw, and an insert suppressed by a database trigger
could be mistaken for success. Seven focused tests failed before these repairs.

The canonical create now acquires an account-specific transaction advisory lock,
checks the existing entitlement engine using that same client, and inserts the
project and optional scheme in one transaction. Exact returned rows are required
before commit. Any failure rolls back the full operation; rollback failure
causes the client to be discarded. Transaction reads execute sequentially on
one PostgreSQL client, while ordinary pooled subscription reads retain their
parallel path. No applied migration or customer database schema was changed.

Generic project insert/upsert is refused. General-map creation calls the
canonical endpoint with its complete GeoJSON, feature IDs/properties, explicit
longitude/latitude coordinate CRS and selected projected measurement CRS. The
schema rejects malformed coordinates, inconsistent grids and unknown creation
keys rather than silently stripping them. Saves allow at most 5,000 features
and 4 MiB; a geometry permits at most 100,000 positions and geometry collections
at most eight nested levels. Unsupported/oversized drawings are refused, never
truncated. The map retains its drawing on failure, keeps recovery guidance visible
and prevents a second save while the first is in flight.

The new-project form was also sending `boundary` and `area_sqm` fields that the
old creation schema discarded. It now saves its site sketch under `boundary_data`
with EPSG:4326, the spherical preview area method, and explicit
`reconnaissance_unverified` status. A sketch can be retained before a survey grid
is established. Its area is an estimate, not measured parcel or legal-boundary
evidence. No datum or UTM zone is inferred from that map.

## Acceptance evidence

- 34 focused cases across creation transactions, generic proxy admission,
  map/sketch validation and existing project-reference creation tests pass.
  Strict application and test TypeScript checks and lint for the seven changed
  source files pass. The repository security gate passes with 119 applied
  production migration hashes pinned. This is not a claim of external secret
  scanning or completion of the wider security audit.
- The combined creation, settings, reference-panel and raw-observation regression
  run passes 82 tests across eight suites. Receipt:
  `.cache/project-creation/jest-combined.json`.
- `node scripts/verify-project-creation.mjs`: eight checks pass against actual
  PostgreSQL and source handlers in an exact owned schema of the existing
  marked rehearsal database. Twelve simultaneous free-plan creates admit one
  project and refuse eleven. Eight active paid-plan creates all succeed.
  Complete map JSON and the unset-reference site sketch round-trip. Suppressed
  parent/scheme inserts and a scheme exception roll back without consuming
  quota; a subsequent valid scheme succeeds. Protected input, inconsistent CRS
  and the anonymous adapter caller are refused.
- All fixture clients return to the pool. Six retained public-table fingerprints
  and 120 synthetic migration records/checksums remain identical, and only the
  exact owned schema is removed. The authentication adapter and isolated tables
  do not establish ordinary-account HTTP or RLS acceptance. Receipt:
  `.cache/project-creation/native.json`.
- CUA used the existing ordinary signed-in source session, without injected
  storage, cookies or tokens. The new-project request returned HTTP 402 and
  visibly displayed `Project limit reached (1/1)`. It retained the synthetic
  draft name, blank datum and zone and recovered its create button. No project
  was created. Receipt and screenshot:
  `.cache/project-creation/browser.json`, `browser-quota.png`.
- The source preview had stopped (no listener/process), so its original launcher
  was restarted only after checking the exact synthetic container and database
  marker. Its loopback origin and cached application directory were reused;
  browser storage and the CAD training drawing were not rewritten. Generated
  type files changed during startup and interrupted one type-check attempt;
  the subsequent full app/test check passed after compilation stabilized.

## Remaining acceptance boundaries

| Boundary | Open work |
| --- | --- |
| Source map workflow | Existing-project drawing updates still use read/merge/write and can lose concurrent edits. Persisted `drawnFeatures` are consumed by drainage alignment extraction but are not restored into the general map's drawing source. Reopening/editing those drawings needs a separate complete workflow repair. |
| Source measurements | The existing general-map save loop measures only polygon outer rings and skips measurement exceptions. This milestone preserves the drawing and its supplied metrics; it does not certify holes, multipolygons or all geometry calculations. Those measurement paths need independent fixtures and repair. |
| Source inventory | Legacy server creation helpers and the inactive auth-v5 onboarding hook remain separate audit items. The locked admission proof covers the active create endpoint and blocked generic proxy, not every historical helper. |
| Browser | The ordinary-account refusal is proved; successful creation, map sketch restoration and recovery after an uncertain network outcome still need complete ordinary-account UI acceptance. A missing response is not proof that no save occurred; the map directs the operator to review Projects before retrying. |
| Live release | These fixes are source-only. Public release identity is still unknown and the candidate requires the coordinated compatibility/recovery/rollback review. Concurrent topographic/engineering changes are preserved. |
| Field / provider | No GPS, instrument, legal-boundary, physical-phone, customer payment or email-delivery claim follows from these checks. The owner's computer-browser-only preference and deferred signing-key rotation remain in force. |

See `PROJECT_SETTINGS_INTEGRITY_2026-10-23.md`, `PUBLIC_AVAILABILITY_2026-10-23.md`
and `TUNNEL_NETWORK_RECOVERY_2026-10-24.md`. The full production-readiness goal
remains active.
