# Continuous retained-observation job: synthetic acceptance

26 October 2026, Africa/Nairobi. This checkpoint connects the existing intake,
review, export and sharing implementations in one continuously retained job.
It adds acceptance tooling and independently inspected sample artifacts. The
application source at this initial checkpoint was `e26b8757`; no application
behavior or production deployment was changed in that acceptance-tooling batch.
The later `PAGED_BOUNDARY_SOURCE_ACCEPTANCE_2026-10-26.md` extends the application's
source review and this verifier's second epoch to 2,000 observations, 2,001
coordinates and a second actual DXF/GeoJSON pair. The current verifier commands
below execute that extension as well.

## Job and evidence chain

The source is a generated, explicitly synthetic paired-angle CSV: three targets,
four resulting coordinates, unknown heights and no independent closing control.
Original strings and bytes are retained. The CSV is attached with an explicitly
reviewed transcription; this does not exercise an instrument-format importer.
The project declares EPSG:32737 and an adopted 0.9996 ground-to-grid factor.

The analytical shape is a rectangle with ground sides 80.123456789 m and
50.987654321 m, reduced through the declared factor. Its stored boundary area
is approximately 4,082.039525766 m². Numerical tolerances below compare software
results; they do not describe physical survey accuracy.

| Stage | Observed result |
| --- | --- |
| Retain observations | Lose the acknowledgement after the real SQL commit; recover and replay the same request. Exactly one original revision and journal remain, with original file/input/result/request hashes checked. No parcel geometry or area changes during computation. |
| Review boundary | Explicitly select the four retained coordinate IDs. Lose the post-commit acknowledgement and replay. Exactly one boundary write remains, linked to the retained observation revision. The source selection carries the exact retained polygon and reviewed-draft state. |
| Store files | Generate the actual DXF and geographic GeoJSON through their routes and registered storage. Lose the DXF commit acknowledgement; recover and retry the exact bytes. Two requests, two registered revisions and two file rows remain. Source manifests match the selected boundary. |
| Share retained draft | Grant one-day access to the stored geographic artifact. Lose the commit acknowledgement and retry the grant. One grant remains; missing/wrong keys and a foreign preview refuse. Recipient data matches the original artifact and excludes raw observations/control and private metadata. |
| Revise geometry | Append another observation revision, then explicitly review its shifted boundary. A new export using the old selection hash refuses. Original inputs, files and the earlier recipient snapshot remain exact. Retained coordinate mutation is refused. |
| Change reference and revoke | Changing the reference closes new current-geometry selection. Recovery returns the original file without relabeling it. Revocation closes recipient reads; replay does not recreate or renew the revoked grant. |
| Transfer ownership | The former actor loses project/source/export recovery access. The current owner can read the original source history, with its original issuer and inputs intact. |

The initial run had two observation revisions and journals, two explicit
boundary drafts, two export requests/revisions/file records and one revoked grant.
The later dense epoch keeps those source/draft/grant counts and produces four
export requests/revisions/file records; its separate proof and examples are
documented in the paged-source checkpoint.
The earlier source records survive these transitions. The job's keys are not
written into the retained proof/sample files.

## Verification

`node scripts/verify-reviewed-boundary.mjs share` now passes **155 native checks**.
The new continuous scenario is one of those checks, containing the seven stages
above; it is not counted as seven independent test cases. All preceding boundary,
map, export and sharing cases still execute. The final native receipt binds the
actual source files, including migration 122 and the intake route, and confirms
owned-schema and temporary-file cleanup, unchanged original records and the
unchanged public migration ledger.

The existing `traverse` mode also passes its **39 native retention checks**
against the final verifier source. Node syntax checks and `git diff --check`
pass. The security gate passes with 119 applied migration hashes pinned,
738 test files and 3,288 source files scanned. Those scan totals are not
executed-test counts. No TypeScript/application change is part of this batch;
the preceding checkpoint's unit/type/lint evidence remains separately recorded.

The new independent reader checks the actual route-generated files using ezdxf,
GEOS/Shapely and PROJ/pyproj. It does not rebuild a replacement DXF or use the
application's computation engine to obtain its expected rectangle.

- Original CSV mapping, control strings, request bytes and input/result/file
  checksums agree with the retained receipt.
- The open traverse keeps unknown heights, misclosure and precision unknown.
- Analytical rectangle coordinates agree within `1e-8 m`; area agrees within
  `1e-6 m²`. Retained hectares preserve the computed value.
- The DXF has one closed 2D LWPOLYLINE, metre units and the exact retained
  coordinate values. Audit errors and repairs are both zero. Zero elevation is
  a 2D drawing-plane value; the file explicitly says no observed heights.
- The geographic polygon is valid, closed and counterclockwise. Longitude,
  latitude values agree with independent PROJ conversion within `1e-8 degrees`.
  Its source hash and public snapshot stay linked to the original artifact.

Use the existing bundled Python 3.12 runtime for the cached native libraries:

```powershell
node scripts/verify-reviewed-boundary.mjs share
& 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/verify-retained-journey-artifacts.py
```

The system-default Python 3.14 cannot load the cached CPython 3.12 native wheels.
No Python installation or persistent configuration change is required. The
independent validator checks exact stage names, source bindings and artifact
hashes before recording success.

Evidence in `.cache/parcel-draft-sharing/`:

- `native.json`: 155 checks, final source hashes and preservation/cleanup flags.
- `journey-proof.json`: seven-stage record, exact synthetic counts and all file
  checksums; its hash is included in the native receipt.
- `journey-independent.json`: independent parser/geometry/projection results,
  package versions and hashes of the native receipt and job proof.
- `journey-original.csv`, `journey-request.json`, canonical input/result files
  and `journey-traverse-receipt.json`: original-source custody.
- `journey-boundary.json`, `journey.dxf`, `journey.geojson` and their source
  manifests: actual retained output examples; `journey-public-snapshot.json`
  contains the allowlisted recipient copy.

## Scope and next acceptance

Authentication and paid-feature admission use the native verifier's bounded
adapters. Actual handlers, SQL, PostGIS, storage and graph transitions run, but
ordinary-account HTTP, a real paid download and browser/phone/admin interaction
are not established. This is a small synthetic job, not a ward-scale benchmark.
The 500-coordinate boundary-review window and the larger campaign/crew/offline
requirements remain open. Actual instrument setup/reduction and real file
dialects remain separate from this paired-angle transcription.

Open the generated files in the intended CAD/GIS applications, inspect plotted
output and repeat the workflow with real pilot observations and independently
checked control. Keep physical-instrument, independent-surveyor and field
acceptance separate from these library checks.

The general production runtime check passes, while the read-only worker artifact
check still fails source/module/dependency/task alignment. The current diagnostic
is retained at `.cache/parcel-draft-sharing/journey-worker.log`. Customer-clone
admission, migration/restore and rollback review, the deferred signing-key
rotation, provider/payment checks and coherent app/worker promotion remain
release gates. Preserve the existing public-parcel Cloudflare containment.
No customer schema, source-data history, user role, subscription/provider state,
production service or localhost training drawing was changed by this checkpoint.

The broader production and international-adoption goal remains active.
