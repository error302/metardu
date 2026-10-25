# Retained selected-boundary exports

Source checkpoint for the owner's large-project, field-to-finish and
international-core direction. This connects the reviewed boundary draft to
registered DXF/GeoJSON files and recovery. It does not certify a cadastral
subdivision, replace field observations, or close the production goal.

## Working sequence

Select parcels in the paged block register, retaining the selection across
pages. An explicit batch contains 1–50 distinct parcel IDs; a 51st selection
is refused without dropping earlier choices. Open **Review selected export**,
inspect the saved parcel revisions, grid areas and declared reference, choose
the output format and confirm the review. The screen uses normal layout flow,
scrollable tables and SVG geomatics/interface symbols without emojis.

`/project/[id]/deliver` now opens this workflow for scheme projects. It previously
redirected back to the scheme overview. Other project types retain their stage
workflow. The scheme output entry does not expose unrelated generic generators.
The new `/project/[id]/scheme/exports` entry accepts the exact register selection.
Its history also works without a current selection.

## Source and reference admission

Exports read actual stored Polygon geometry through the bounded owner-bound
selection helper. They never reconstruct rings from station-name sorting or
download the whole project. All selected shapes must still match their retained
reviewed-draft receipts. Missing, incompatible, changed, unassessed, invalid,
oversized or incomplete selections fail closed. The parcel's recorded status
does not become a field approval or cadastral issue authority.

The review hash binds the complete selected read: IDs, stored geometry, exact
parcel timestamps/revisions, geometry/evidence/receipt hashes and saved reference
fingerprint. The register token is a full SHA-256 represented in base64url with
a `scheme:` prefix (50 characters), fitting the existing revision columns
without truncating the identity. Original observations, original numeric source
strings and prior geometry remain in migration 119's immutable source receipts;
the export manifest links those receipts and retains the selected geometry.

Generation locks the current project owner, selected parcels, reference and
retained source parents/rows, then re-reads the selection. Parent locks prevent
new observation/coordinate FK admissions during publication. Source changes
refuse the reviewed request. New requests serialize within a project; this is
not campaign throughput or cross-workflow concurrency acceptance.

## Output semantics

- DXF contains closed **2D** LWPOLYLINE outlines in the declared project grid,
  with metre units and stable parcel-ID/ring layer mapping. It creates no
  observed beacon points, invented altitude or 3D terrain. Its comment explicitly
  states that observed heights are not provided. A drawing's implicit plane is
  separate from measured height, which remains in the original retained source.
- GeoJSON uses geographic WGS 84 longitude/latitude and decimal degrees, with
  no projected `crs` override, following [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946).
  Outer/inner winding is normalized for geographic output. Conversion uses the
  registered CRS definitions and proj4 version, retained in the manifest.
  Antimeridian-crossing boundaries require explicit splitting rather than an
  unchecked export. Registered datum parameters do not establish local control
  accuracy; the interface and artifact label this geographic interchange as
  an unverified draft. Project-grid geometry remains available for measurement.

The manifest retains encoder/version, definitions, full source snapshot,
geometry/receipt/revision identities, units and dimension semantics. Both
`professionalApproval` and `fieldVerified` remain false. These boundary outlines
are not a final deed plan, cadastral approval, complete survey report, measured
height schedule or an original instrument observation file.

## Atomic registration and durable outcomes

Each bounded UTF-8 command has an explicit actor/project, reviewed selection,
source hash and request UUID. New output uses POST; bare legacy project-only
GET downloads return 400. GET recovers an already registered request.

The file is stored and read back with a 4 MiB bound and hash/byte verification.
Its file-upload record, IN_REVIEW deliverable revision, exact source manifest,
EXPORTED event and immutable request outcome must agree in one database
transaction. The event details and hash are checked using the writer's existing
hash protocol. A suppressed or altered acknowledgement cannot return a download.
Rollback removes only a newly created, positively unregistered owned file;
committed or uncertain artifacts are retained after a lost COMMIT acknowledgement.

Migration **120_scheme_export_requests.sql** adds immutable committed/cancelled
outcomes, exact request identity and issuer/current-owner RLS. Committed append
policies require the matching owned deliverable revision and manifest; former
actors cannot erase transferred history. It remains **source/fixture-only**,
as does migration 119. No customer/preview public schema was migrated.

A repeated request recovers the exact retained bytes without another revision.
Changing the intent or format under the same request ID is refused. Recovery
does not regenerate against changed current geometry, a new reference or an
expired paid plan. Generating another DXF still requires normal plan admission;
no account role, subscription or provider state was changed for this checkpoint.

Cancellation shares the request lock. If generation committed first, it returns
that saved file; otherwise it durably closes the request ID. Delayed generation
then returns the cancellation receipt. This permits a surveyor to resolve an
uncertain attempt and review new work without silently duplicating revisions.

Generic storage upload/delete cannot replace or remove retained surface/scheme
artifacts, including Windows case aliases. Downloads verify the file's hash and
require its issuer and current project ownership. Unknown or corrupt files do
not become replacement exports. Scheme reads are bounded; GeoJSON MIME is explicit.
The GCS metadata option uses the installed SDK's `cacheControl` field; real cloud
provider storage/IAM behavior remains a separate verification gate.

## Device and history behavior

The application records its exact pending intent under an account/project
namespace before transmission, with Web Locks to coordinate tabs. Corrupt,
foreign, unacknowledged or unavailable device records prevent a new send.
Timeouts retain the same request. Confirmed cancellation or verified registered
bytes clear only that exact record. Unmount/scope changes prevent late downloads
and acknowledgements. The CAD training drawing and its storage are untouched.

History reads return 24 metadata rows per page and an aggregate count for the
current account in the owned project. Earlier files remain recoverable after a
local recovery record or current geometry changes. Cancellation is never shown
as a downloadable or approved file. Failed, mismatched and timed-out reads remain
unavailable, with no fabricated empty register or retained foreign-account rows.

## Verification

Reports are under `.cache/scheme-boundary-export/`. Source, synthetic database,
middleware, independent codec and real browser/provider/field evidence are
distinct. The native authentication/plan adapter does not establish an ordinary
account's JWT, paid entitlement or production RLS behavior.

The first native run reproduced three generic-storage bypasses: retained scheme
files could be replaced/deleted or served after corruption. The namespace,
ownership and hash guards now cover those paths. A real-middleware regression
also reproduced consumed request streams and 500 responses: streamed routes
must opt out of wrapper JSON parsing. The reviewed-boundary and export POST
handlers now use `rawBody: true`, with explicit bounded parsing/validation.
Real middleware tests use bounded session/provider mocks; native tests run actual
handlers, PostgreSQL/PostGIS, storage bytes, register and request journals.

Final verification passes application/test types and scoped ESLint. The combined
regression run passes **148 tests in 19 suites**. This includes the actual
middleware body tests, device/recovery/history UI and the adjacent map, boundary,
parcel, storage and revision/offline contracts. A 50-interaction JSDOM check uses
a bounded longer test timeout; these functional checks are not an application
performance benchmark.

The native run passes **127 cases**: 50 reviewed-boundary, 29 map and 48 export
checks. Public records, the migration ledger and tested source manifests remain
unchanged; the exact marked schema and owned export files were removed. It
creates no application container, builder, extension, role or production
migration. The 50-parcel DXF is 20,714 bytes. A 55-request history returns 24
metadata records in a 7,546-byte first page. These synthetic observations are
not a latency, concurrency or real campaign SLA.

Independent ezdxf 1.4.4/GEOS/PROJ checks pass on actual handler files: 1 and 50
closed 2D metre-grid outlines, each with the known 200 m² area and 60 m perimeter,
zero DXF audit errors and zero repairs. Geographic output agrees with pyproj
3.7.2 to the declared 1e-8-degree comparison tolerance on the synthetic WGS 84 /
UTM 37S rectangle. This is codec/projection agreement, not field or local-datum
accuracy. The report is `independent-artifacts.json`, bound to the native receipt
hash and artifact hashes. Receiving-CAD, printer and instrument/field proof
remain separate.

The static route check passes: **239 page files, 823 static links, zero unmatched
references**. The staged security gate passes: all 119 applied migration hashes
remain pinned, and API-proxy/PWA guards are verified. Migration 120 is not applied.

## Remaining release and workflow work

No application image, worker, deployment, production migration or push is part
of this source checkpoint. See `BACKUP_CATCHUP_2026-10-25.md` for the separate
owned backup catch-up and fresh runtime result. Restore/off-host recovery,
worker artifact alignment, clone/migration compatibility, deferred signing-key
rotation and the existing release gates remain open.

A fresh read-only `npm run docker:verify:worker` still fails artifact admission
for worker image `30e83e33403f9e5accb6eddeccb940ece69df71d4a7b27d69406bf96f453241a`:
`main.py`/`requirements.txt` differ; `rtklib_baseline.py`, `pointcloud_processor.py`,
the OSM/cache modules and `compute-contract.json` are missing, as are
laspy/lazrs/pyproj distribution metadata and `parse_lidar` task declaration.
No worker rebuild or service lifecycle change was performed. General runtime
health passes with the fresh backup, but does not close this artifact blocker.

Ordinary-account/paid/browser/admin/mobile checks, actual receiving-CAD and
independent-surveyor/field acceptance remain open. Registered default datum
conversion is not a site calibration or jurisdictional acceptance. Final issued
parcel workflows, crew permissions/conflicts, durable uncommitted boundary intent,
asynchronous campaign exports and representative capacity/concurrency benchmarks
remain separate work. The legacy shared evidence-event writer still needs a
cross-workflow atomic-chain audit; this checkpoint verifies each export's event
acknowledgement, not the completeness of all historical chains.

Public parcel sharing/privacy/reference defaults and legacy traverse intake are
the next source integrity priorities in the full execution plan. A checked
selected draft export does not complete the broader production goal.
