# Field control checks

Field checks retain a physical inspection or measured coordinate comparison
against an actual saved control record. A recorded result does not certify a
mark, establish statutory compliance or prove statistical stability. Neither
the catalogue's review status nor point registration is promoted automatically.

## Workflow

Select an owned project and a current control mark, owned beacon or owned
boundary monument. The mark must have an explicit projected metre grid matching
the saved project declaration. A height comparison also requires a saved height
and an identical explicit vertical datum. Legacy datum/EPSG defaults are not
treated as declarations. In particular, the existing boundary-monument writer
still needs a separate reference-declaration repair before its legacy/defaulted
records can participate in this workflow; they appear disabled with a reason.

Record the actual observation time, physical condition, method, instrument and
field-book/evidence reference. For measured checks, supply horizontal and/or
vertical comparison criteria in metres and identify their source, such as the
job specification. No 5 mm default is inferred. Visual inspection retains no
coordinate pass; levelling compares height alone. Poor, disturbed, destroyed or
missing condition prevents a usable-condition result even when residuals pass.
The engine computes signed observed-minus-basis differences and a grid
horizontal distance without display rounding before comparison.

The form displays the saved basis instead of asking for published coordinates.
It sends a hash of both the complete source record and project reference. A
change to either requires a reload before a new comparison is recorded. On save
failure the observations stay in the form, and an identical retry uses the same
request UUID. Successful history displays zero as a real residual and includes
the retained source, reference, observation, criteria and result evidence.

## Persistence and authorization

`GET /api/control-points/verifications?projectId=...&options=true&pointType=...`
loads saved basis choices; the history read uses the same project identifier
without `options=true`. `POST` accepts strict observation inputs; caller-supplied
published coordinates, status, certification or actor identity are rejected.
Project locking serializes writes and lost-response retries. A changed request
under the same UUID conflicts. A point, source or declaration never gets a
verification flag simply because an observation was saved.

Forward migration 103 adds `control_field_checks`, immutable full snapshots,
source/reference comparison guards and private project RLS. Check and row-linked
audit event commit in one transaction. `to_jsonb` keeps PostgreSQL timestamp
microseconds intact. Updates and deletes are rejected by immutable triggers,
including ordinary administrative DML; privileged DDL remains a separate
operational control. The table is not exposed by the generic database proxy.

Historical `control_point_verifications` records are preserved and restricted to
their original actor, with new inserts and ordinary changes closed. Their old
pass status was based on caller-entered coordinates and an unevidenced default;
it is displayed separately as legacy evidence, never as a new project check.
Authorization uses both route ownership checks and database row policies; see
[PostgreSQL row-security behavior](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## Current evidence and limits

Migration 103 was applied only to the marker-checked synthetic rehearsal. The
rehearsal has 108 migration entries; earlier applied bytes were not changed.
`scripts/verify-field-control-checks.mjs` passed 37 checks with actual route
wrappers, restricted PostgreSQL, RLS, locks, immutable triggers and injected
audit failure. Only the provider session was substituted. Eight tests across
three suites cover the calculation/validation, failed-save retry behavior,
numeric zero in history and the existing catalogue UI regression. CI runs the
native verifier. Application/test strict checks and scoped lint passed and are
recorded in `test-results/runtime-database/field-control-source-verification.json`.

Packaged verification uses `scripts/verify-field-control-http.mjs` against an
isolated loopback preview and synthetic password accounts. All 15 checks passed
in image `sha256:ded6a34380dd63ce110186c15a82ecb015d093dc8d691cf71242d275c6112085`
on localhost port 3009. An actual browser saved a synthetic 3 mm east / 4 mm north
comparison, reloaded the page, reselected the owned project and displayed a
5.000 mm horizontal difference plus 0.000 mm height difference. Database readback
confirmed the observations, criteria, exact source/reference snapshots and
actual audit identity. Synthetic accounts were suspended after verification and
the browser fixture password removed. Results and screenshots are under
`test-results/field-control-http/` and `test-results/field-control-browser/`.

Compilation took 3.7 minutes; the build command completed in 672.3 seconds and
image export in 188 seconds. Production strict typing remained enabled. All 217
static pages generated; PWA was disabled for this rehearsal. An initial
PowerShell public-health probe timed out after 20 seconds before the HTTP
verification succeeded. The container is now healthy; this is not an uptime or
cold-start benchmark. Provider OAuth, live HTTPS
ChatGPT behavior, physical instrument observations, professional approval and
customer database upgrades are not established by these synthetic checks.

At 390 by 844 pixels the cards wrap and remain readable. A floating feedback
button obscured text at some scroll positions. A later source-only adjustment
places that button after the footer in normal document flow on phones, with a
44-pixel touch target; desktop keeps its shortcut. That change is not in this
verified image and needs its own packaged mobile check. The source artifact
keeps the verified widget hash separate from the later styling hash. The
viewport override was reset after inspection. Additional UX work remains for a
direct signed-out sign-in invitation and preserving the selected project across
reloads; neither prevented authenticated evidence persistence in this test.

Follow-ups include basis-choice search/pagination beyond the first 200 marks,
history pagination beyond 100 checks in the UI, boundary declaration repair,
firm/crew permissions, instrument/calibration evidence attachment and a
professional review/approval stage. A supplied criterion is a declared job
comparison, not a claim that METARDU has validated the governing standard.

Later mobile-feedback verification: the subsequent reviewed-benchmark image
`c65dce447f991ff48aa5ffcc1816e1b29ed0dd2bd724ac97a58f3a54aef5a485`
includes the feedback adjustment. Actual catalogue browsing at a requested
390-by-844 viewport confirmed a 44-pixel trigger in normal document flow after
the footer, without horizontal overflow. See
`test-results/benchmark-catalogue-browser/mobile-layout.json` and
`docs/reviewed-benchmark-catalogue.md`. This confirms the shared widget styling
in that later package; it does not rerun the field-check workflow in the older
field-control image.
