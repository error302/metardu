# Recovery and migration review — 10 October 2026

Actual recovery proof now exists for the named fresh database and upload
archives. This is separate from source tests and from the older schema-only
synthetic rehearsal. Production data/schema/application were not upgraded in
this recovery stage.

## Actual archive recovery

The test reused `metardu-schema-rehearsal-20261008` and `metardu-backup`; no new
application container or builder was created. It refused an existing target,
created only `metardu_recovery_verify`, revoked public connections and retained
the original owner semantics with a temporary non-login owner role. The
restricted runtime test login used an in-memory random credential.

The first restore was correctly rolled back because the rehearsal client's
psql 15.4 did not understand the pg_dump 16.11 archive's `\restrict` directive.
The successful restore used the existing backup service's psql 16.11, preserving
the archive and its safety directives. Backup was briefly attached to the owned
rehearsal network; its original network configuration was verified afterward.

The plain SQL archive was restored using `-X`, `ON_ERROR_STOP=1` and a single
transaction, following [PostgreSQL's restore guidance](https://www.postgresql.org/docs/15/backup-dump.html).
No SQL, private filenames, individual row identities or credentials were logged.
No customer file or database payload was written to the workspace.

- Database archive: `/backups/db_20261009_221125.sql.gz`, SHA-256
  `c3da5c0eb3a60bcb4046b569bbd140f4c67efe776ea26694cbe66dbed048de47`.
- Upload archive: `/backups/uploads_20261009_221125.tar.gz`, SHA-256
  `429e2e095b5e8dfdea57051f05b6b93209a1d34189203dc37fb81e0122e7e732`.
- 140 restored public application tables, 753 rows including the migration
  ledger, matched current production counts and canonical content fingerprints.
  Extension-owned catalogue tables were excluded from these customer comparisons.
- All 24 upload files, totalling 669,356 bytes, were actually extracted into an
  owned 0700 temporary directory and independently matched native tarfile
  per-file SHA-256 results. Archive paths, links and duplicate entries were
  checked before extraction.

The database, temporary owner/runtime roles and extracted files were removed;
their absence is verified in `test-results/recovery-proof/verification.json`.
The failed-client attempt and the failing imported-control regression are
preserved separately as evidence. Production health passed after cleanup.

The table comparison uses PostgreSQL canonical JSON values, normalizes scalar
numeric scale, and compares count plus sorted MD5 content fingerprints. It is
an operational preservation check; the archive/file integrity records use
SHA-256. Neither is a legal survey accuracy or adversarial database attestation.

## Migration compatibility and restricted role

The ordinary source provisioner upgraded the actual restored records from 69
to **109** migration entries. This includes the original 39 pending migrations
065–103 plus the new forward fix 104 described below. No applied historical
checksum was edited and no `--force` path was used.

139 original customer tables retained their original-column counts and content
fingerprints after migration. Migration ledger additions were checked
separately; migration 068's one additional reference-profile seed was separately
counted, while all pre-existing profile rows remained unchanged. Numeric
widening in migration 102 preserved values rather than treating added decimal
zeros as changed measurements.

The actual runtime login passed the production role gate: no superuser,
BYPASSRLS, role/database administration, replication, schema/database CREATE,
public-object ownership or migration-ledger mutation; its only membership was
the safe `authenticated` compatibility role.

Rolled-back synthetic permission checks on that restored/upgraded database
passed active firm rights, viewer downgrade, removal, private-project isolation,
audit integrity and privacy, ordinary deletion history, immutable organization
scope and imported-control protection. These checks do not substitute for
normal-account HTTP/browser workflows after application promotion.

## Reviewed forward changes

| Migrations | Release/data implications |
| --- | --- |
| 065–066 | Explicit project declaration; existing stored CRS values remain, new defaults removed. Legacy values are not declaration proof. |
| 067–070 | Calibration/source records and job types; immutable raw batch metadata. Review existing job-type/constraint compatibility. |
| 071 | General projected parcel geometry preserves stored SRID; imported source coordinates remain immutable. |
| 072 | Deliverable, computation and measured QA registers; append-only revision evidence. |
| 073 | Road/engineering column alignment and unique indexes; existing alignment ordering/name duplicates require preflight. |
| 074–076 | Surface, contour, set-out and design revisions; retain measured evidence and use forward fixes. |
| 077–080 | Hash-only, scoped ChatGPT grants; broader scopes require new consent. Provider/HTTPS availability remains external. |
| 081 | Session versions; verify sign-in/revocation behavior after promotion. |
| 082–083 | Owner-bound basemap files and explicit field CRS; unknown historical CRS remains unknown. |
| 084–085 | Saved engineering JSON and set-out provenance retained; no destructive automatic down path. |
| 086–089 | Firm role/subscription guards and set-out RLS; viewers cannot write, removed creators lose access. |
| 090–092 | Payment-provider/admin request contexts and beacon ownership; authenticate before installing any privileged request context. |
| 093–096 | Raw capture/reference provenance, sequential design history and required immutable set-out snapshots. Older writers can become incompatible. |
| 097–099 | Project-private append-only audit and suspended-session/grant revocation; no historical payload/hash rewriting. |
| 100–103 | Source/reference/review/control captures remain immutable; no guessed CRS or historical tolerance certification. |
| 104 | Correct ordinary-point DELETE trigger return while retaining imported-control protection. |

Several security/evidence migrations explicitly refuse destructive rollback.
Preserving the old app image alone is insufficient for complete database
rollback. A promotion must coordinate writers and retain the verified archives,
exact image, environment continuity and a recovery/maintenance plan.

## Defect found by the actual recovery check

Migration 101's `protect_imported_control_coordinate` always returned `NEW`.
For a BEFORE DELETE trigger, that is null and silently suppresses deletion of
ordinary points. The existing native permission test failed at its authorized
ordinary-point deletion assertion. The failure is preserved as
`imported-guard-regression-before.json`.

New migration **104_imported_control_delete_guard** returns `OLD` on an
uncaptured DELETE. Captured control deletion/coordinate mutation still raises.
The ordinary deletion/audit test and new explicit captured-control tests both
passed on the actual restored copy. Existing migration 101 remains untouched.

## Application release gates in progress

An additional workflow review found the general project export route accepting
legacy display CRS fields without a declaration, replacing incomplete adjusted
coordinates through per-axis fallback/coercion, and omitting deleted-point and
private-cache guards. Six new route regression cases failed before correction.
The route now uses the saved declaration and CRS authority, requires a complete
finite coordinate pair and matching raw-point source CRS, excludes deleted
points, and serves private uncached artifacts. Unknown GeoJSON heights now remain
null with two horizontal ordinates; the separate height regression first failed.
The updated focused export/provenance run passes 42 tests; final application/test
typing and scoped lint pass. Legacy source records are retained, and export requires review
where their CRS evidence is missing. No customer coordinates were rewritten.

The candidate build's Alpine and npm installations completed. Its compilation
used the earlier source snapshot, so the exact owned build client/helper was
stopped before promotion; production services were untouched. Its log and
metadata are preserved as attempt2. Refresh only the SAME candidate tag and
default builder after source gates finish. The promotion helper now refuses a
changed source fingerprint, checks active processing, takes a new checkpoint,
and compares all original customer-table fingerprints before opening the app.

The latest broad source run recorded **4,035 passing tests, one CAD import UI
timeout, eight skipped tests, and one passing snapshot** across 370 passing
suites/one failed suite/two skipped suites (474.823 seconds). The unchanged CAD
workflow suite then passed all **26** tests on its isolated rerun (19.93 seconds).
Its asynchronous test-worker `act` warnings remain harness diagnostics. This is
reported separately from the earlier wholly green 4,027-test run and actual CUA
worker proof; no assertion or timeout was weakened to manufacture a pass.
Read-only production processing preflight found zero active background, render
or drone tasks. The corrected candidate can now reuse completed dependencies;
no active candidate build ran in parallel with another candidate build.

The corrected Node22/Next15.5.27 build compiled successfully, passed its own
type validation and reached page-data collection. Its PWA warning excludes the
6.02MB chunk `fbe89ba5.7144cd6a95cd6b78.js` from automatic precaching. It is a
material offline coverage limitation, not a reason to silently enlarge the
precache budget. Physical device/network/offline workflows remain a separate gate.
The idle synthetic login source preview3020 was retired after saved PID/parent
chain/listener and zero-browser-connection checks. CAD3021 and all production
services stayed running; no browser drawing state or files were deleted.

A broader source run found 4,010 passing tests and seven failures. Three were
obsolete expectations: a tangent-only vertical-curve endpoint, an unreferenced
old DXF version/scale fixture, and a source-text set-out evaluator check. They
were corrected using independent endpoint arithmetic, an explicitly referenced
CAD fixture with regenerated labels, and actual capture-engine behavior.

The map/ownership failures exposed unassigned legacy access. Current source now
refuses project/point/version access without an actor and recorded ownership;
unassigned records are retained privately for reviewed ownership recovery. No
customer ownership was guessed or assigned. Seven new tests first reproduced
that defect. The updated focused release set passed 94 tests. The broader final
run and strict typing/lint are still being recorded; do not treat that focused
set as final promotion evidence. The later final source run passed **370 suites
and 4,027 tests**, with two suites/eight tests skipped and one passing snapshot.
Strict app/test types and scoped lint passed. The host Node 26 localStorage
experimental warning remains; an expected negative migration-verifier test also
prints a fail-closed diagnostic. No false production failure is inferred from it.

The source map endpoint also omitted soft-deleted rows from none of its three
query forms. Tests reproduced that boundary defect, and all extent/raw/clustered
queries now exclude soft-deleted points so retired observations are not plotted
as current field data. Their three red query tests failed before the fix and pass
in the final full source run.

The missing local APP_DB_PASSWORD was generated with 32 random bytes. All other
settings were preserved, and production auth/worker/admin secrets and origins
match the planned compose configuration. This only prepared the local credential;
the production runtime role is not changed yet. Optional API_ADMIN_KEY remains
absent. No credential value is in this report or its evidence.

The actual CAD source browser-worker check later passed through recovered CUA:
two 10,000 m² faces, 20,000 m² total and 700 m unique linework. Its screenshot and
expanded face schedule are recorded in the CAD verification report. The original
application is still running while one reusable candidate image builds. Live
provider OAuth/HTTPS ChatGPT, normal-account production workflows, automatic
next backup, offsite/disaster recovery and physical field/legal gates remain
open until separately verified.

## Actual production promotion and subsequent HTTP finding

Production upgraded from 69 to 109 migrations with all 139 original customer-table fingerprints unchanged and all historical hashes preserved. Runtime metardu_app has no ownership, bypass, administration, DDL or ledger-write privilege. Candidate 80497396... is healthy. Supporting identities/images/start times and canonical mount sets are unchanged. An order-sensitive mount assertion was corrected without another migration or service restart; the original failed report remains in promotion-mount-order-failure.json.

The private old application log is only in the existing backup volume at /backups/app_before_upgrade_20261010.log. Promotion checkpoint archives are db_20261010_001110.sql.gz and uploads_20261010_001110.tar.gz.

Normal-account HTTP sign-in, project creation/privacy, explicit CRS declaration and precise point capture passed. Coordinate export then returned 500: its SQL selected nonexistent survey_points.point_type. Native WHERE false SQL reproduced that failure without reading customer rows. The canonical field is is_control; source query/type/mapping now uses it. A new control-flag test first failed and then passed. 43 focused export/provenance tests, final app/test typing and scoped lint pass; the corrected query passes on the actual 109-entry schema.

The same candidate tag is being rebuilt for an app-only correction, with no further database migration. Current image 80497396... is protected as metardu-metardu-app:rollback-current; original d2b47891... remains protected with the pre-migration recovery archives. Do not use the original image alone as a rollback against the upgraded database.

Both failed HTTP attempts are preserved. Their four clearly labelled synthetic accounts were disabled and sessions/passwords invalidated; private projects and immutable audit evidence are retained. No pre-existing customer records were edited or deleted by those HTTP checks. Remaining HTTP checks must complete on the corrected production image before reporting normal-workflow proof.
