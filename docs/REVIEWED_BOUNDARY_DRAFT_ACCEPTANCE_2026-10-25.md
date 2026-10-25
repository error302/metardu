# Reviewed parcel boundary drafts

This source checkpoint replaces the implicit first-parcel conversion with an
explicit review and retained draft command. It does not establish field checks,
professional/cadastral approval, complete traverse computation or production
release acceptance.

## Resulting workflow

From a block's parcel register, open **Review boundary** for the intended parcel.
The map computation/layer panels link to those registers. The reviewer chooses
an actual retained parcel traverse from 24-row pages, then adds and orders the
required coordinate IDs. Neither a project computation result ID, station-label
sorting, SQL row order nor every traverse station is assumed to be a boundary.

The page shows the saved projected reference, retained coordinate/observation
counts, genuine zero/unknown heights, chosen order, an SVG shape and grid area /
perimeter. Any order or note change invalidates the review checkbox. The user
explicitly declares that the selected source coordinates use the shown project
grid. This declaration is retained; it is not independent evidence that an older
coordinate set was originally computed in that grid. The current legacy source
does not itself provide complete per-computation CRS provenance.

Saving calls the owner/project/parcel/traverse-bound endpoint
`/api/project/[id]/scheme/parcel-boundary`. The client sends a reviewed ID command,
not arbitrary replacement geometry. The server resolves the selected retained
coordinates, checks a simple nonzero ring, and derives grid measurements through
the shared CRS/geometry core. Unknown or nonfinite coordinates, repeated locations,
crossed rings, foreign IDs and mismatched source grids are refused without repair.
The final edge closes automatically. Area stored in the parcel register is rounded
to its six-decimal hectare representation; the receipt retains grid square metres
and perimeter as well.

The transaction locks the owning project, parcel, reference, selected traverse
and bounded coordinate/observation rows. A SHA-256 review fingerprint includes
the parcel/version/geometry state, complete reference, traverse state, exact source
coordinate text, original record JSON and raw observation JSON text with edit
tokens. A changed owner, source, observation, reference or parcel refuses the old
review. Original numeric source text survives JSON/JavaScript number conversion.
The numerical draft is derived using the normal floating-point geometry engine;
this is not a new precision or field-accuracy certification.

The server writes a Polygon in the explicit project EPSG SRID, validates the
stored PostGIS geometry and checks identity, coordinates, area, SRID, revision
and exact timestamp before commit. It then appends the exact response receipt
and retained source/review/prior-geometry snapshot in the same transaction.
Suppressed or altered geometry/receipt acknowledgements roll back both the parcel
and transactional fixture audit history. The previous geometry is retained as
EWKB with its original SRID, together with previous boundary JSON and supplied
area. Parcel approval/status is not advanced. Issued, confirmed-LR or unrecognized
parcel states are protected from replacement through this draft workflow.

Requests use an immutable `(actor, request UUID)` receipt and versioned
`reviewed-parcel-boundary-v1` intent. A lost acknowledgement can replay the exact
request without another parcel revision; reusing the UUID for changed intent
is refused. Concurrent equivalent requests converge on the retained receipt;
competing reviews cannot silently overwrite one another. Network/ambiguous
acknowledgement failures retain the exact in-memory command and lock editing for
retry. A definitive 4xx refusal retains the visible draft but permits reload and
new review. Successful or interrupted request IDs are shown. An authorised user
can retrieve their committed receipt by request UUID from another device; historical
receipt lookup is clearly separated from a new save/current revision.

The page uses normal-flow responsive sections, bounded scroll regions, labelled
SVG controls and a grid-based SVG preview with no external basemap requests.
Preview vertex labels are spaced to avoid dense annotation collisions; all
vertices remain in the stored geometry and complete ordered register.
There are no new emojis. The old map hook remains a non-writing compatibility
bridge; it no longer downloads summaries, auto-selects a first parcel or creates
an unreviewed preview. Optional OpenLayers preview helpers require an explicit
project grid. The persistence helper no longer calls absent singular-parcel
routes or returns a computed result after failed saves.

## Bounds and schema compatibility

Each review accepts at most 500 coordinate rows and 2,000 original observation
rows. It refuses source payloads over 4 MiB without transporting/clipping a
partial source. Only 50 available coordinates render at once; source directories
page 24 traverses. The streamed command body is limited to 64 KiB before JSON
parsing. Prior geometry above a 16 MiB retention window is preserved and refused
for replacement through this path. These are leaf-review bounds, not whole-project
capacity or a concurrent-crew SLA.

Source reads tolerate canonical `station_name`/`elevation` and older application
`station`/`rl` aliases by explicit JSON lookup. If both versions disagree, review
is refused. The canonical table uses `station_name`/`elevation`; the legacy
traverse writer/reader's assumption of `station`/`rl` remains a separate schema
and computation repair. No applied migration is edited to conceal that mismatch.

Pending migration `119_reviewed_parcel_boundary_drafts.sql` appends receipt /
snapshot storage, owner-scoped read/append policies, update rejection and
retention constraints. It preserves the tested whole-project/owned-account graph
lifecycle while preventing direct removal of retained parcel/traverse sources.
Deleting a former actor cannot erase a transferred project's history; that
account-deletion conflict requires a reviewed retention workflow. Receipt recovery
remains scoped to its issuing actor and current project ownership. It relies
on the generic Polygon storage introduced by applied migration 071 and on the
existing compatible parcel revision/reference columns. It is applied only to
the uniquely owned native fixture. The source preview public schema and customer
production are not migrated. Missing receipt storage leaves source review
available and visibly disables saving.

## Verification evidence

The initial regression reproduces acceptance of a nonfinite legacy polygon;
the corrected pure/UI suites also cover failed-save refusal without fallback,
explicit selection/review, analytic measurements, crossed order, genuine unknown
heights, stale review, identity/geometry acknowledgement mismatches, exact retry,
storage unavailability, failed source reads and historical receipt recovery.

The native verifier uses actual route handlers, input contracts, SQL and real
PostGIS through a bounded authentication adapter. Its scope includes geometry /
receipt fault rollback, prior-geometry preservation, precise original observations,
owner/reference/coordinate/observation/version stale-review cases, equivalent/competing requests,
receipt recovery, actual EPSG storage, bounded pages/windows, immutable receipt
updates, fixture authenticated-role permissions and project/source retention.
That fixture role/policy proof is not ordinary-account HTTP or the complete
installed production RLS/trigger set.

Reports are in `.cache/reviewed-boundary/`: `source-tests.json` and `native.json`.
The original numerical red report is `.cache/boundary-review-red.json`.
The native verifier checks the exact existing rehearsal service ID, purpose,
loopback port/database marker and pre-existing PostGIS. It creates no extension,
role, service or public table. It verifies original public-record and migration
ledger fingerprints, hashes the actual tested source and removes only its marked
fixture schema. No public search-path fallback is allowed; PostGIS/crypto function
calls name their existing extension schema explicitly.

The final adjacent regression run passes **50 tests in five suites**, including
the pure/UI boundary cases, parcel register, map wiring and CRS guards. App/test
type checks, scoped lint and the static route checker pass (238 page files,
823 static links, zero unmatched references).
The security gate passes with all 119 applied migration checksums pinned and
the API-proxy/PWA guards intact. Read-only `npm run docker:verify` also passed
at the start of this turn: one existing production application and required
supporting services. The reported `2026-10-24T02:00:04Z` backup remains
archive/header evidence; restored recovery is unproved.

The native verifier passes **50 cases**. Its 500-coordinate source response is
54,102 bytes; traverse candidate pages remain 24 rows. Real PostGIS storage is
checked under EPSG:32737, EPSG:21036 and EPSG:32632, including the independent
200 m² / 60 m rectangle measurement. These are synthetic fixtures and conditional
CRS/storage proof, not jurisdictional or concurrent-capacity acceptance.

## Remaining acceptance

This is a source workflow with the scoped checks recorded above.
It is not ordinary-account/browser, customer-schema, receiving-CAD/print, physical
instrument, field or production proof. Actual narrow/mobile rendering and existing
administrator access still need a signed-in QA session.

The wider map API remains unbounded and still constructs rings from sorted
traverse coordinates rather than the retained reviewed geometry. The dedicated
scheme canvas still assumes EPSG:21037. Map/exports must consume the retained
revision/reference correctly and expose staleness before release. Legacy traverse
intake/computation/schema compatibility, adopted accuracy/parent evidence, adjacent
parcel/parent topology, bulk operations and crew access remain open. A simple ring
check alone does not prove subdivision topology or title authority.

In-memory pending intent/unsaved vertex order is not durable offline storage.
Committed receipt recovery works by request ID; uncommitted intent recovery,
browser/device interruption and quota handling still need the common recovery
pipeline. Large-job/crew performance, applied-schema/trigger/RLS compatibility,
restore, coherent worker/application release and the owner's deferred security
gate remain separate requirements.

No production lifecycle, image, migration ledger, customer data, account role,
subscription/provider state, source observation or training drawing is changed by
the verification. Independent dirty configuration/advisory/marketing work remains
excluded from this checkpoint.
