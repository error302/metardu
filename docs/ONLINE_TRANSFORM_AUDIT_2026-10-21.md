# Separate online coordinate service: verified release blockers

## Scope

This audits `src/lib/online/coordinates.ts`, the actual transform tab in
`src/app/online/page.tsx`, and `/api/coordinates/transform` plus
`/api/coordinates/batch`. They are separate from the API engine repaired in
`ad48667d`. No implementation change to this online contract is made here.

Eight probes executed the actual service using synthetic data. The ignored Jest
wrapper completed successfully as an evidence recorder; this is **not** eight
passing feature-acceptance tests. No network, application database, production
worker, browser storage or customer records were used.

## Reproduced behavior

| Probe | Actual current behavior | Consequence |
| --- | --- | --- |
| Empty UTM → UTM | `success: true`, empty result, `precision: exact` | Missing measurements can look successful |
| Unknown → same unknown system | Same empty success | Internal helper identity bypasses reference validation; the public API enum independently refuses unknown names |
| WGS84 identity with latitude 91° | Success, `precision: exact` | Invalid geographic bounds accepted |
| UTM 37N, E=500000 m, N=0 m | `Missing UTM parameters` | Truthiness treats an explicit zero as absent |
| WGS84 UTM 37S inverse | Close agreement with the synthetic input | Basic WGS84 projection path works; this is a useful positive control |
| WGS84 geographic → UTM without target grid | Automatically selects 37S for the synthetic point | The request cannot select a different required target/project grid |
| Shared-authority Arc 1960 37S synthetic grid → WGS84 | Material disagreement with the originating point and native PROJ | Duplicate datum calculation path is inconsistent |
| `CAPE` selection | Uses a record named `Cape Verde (Cape) 1955`; menu calls it Cape, South Africa | Source catalogue and parameter identity conflict |

The service returns fixed `precision` strings (`0.001m` or `0.01m`) without
operation accuracy, control comparison or uncertainty evidence. These strings do
not substantiate millimetre/centimetre position accuracy. The page labels them
“Precision.”

## Independent native consistency check

The synthetic source is longitude 36.8219°, latitude -1.2921°. The repaired shared
authority generated Arc 1960 grid coordinates E=257538.86000969677 m,
N=9857382.339634635 m using the existing explicit definition:

```text
+proj=utm +zone=37 +south +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs
```

The installed host pyproj 3.7.2 / native PROJ 9.5.1, with networking disabled,
inverts that same definition to longitude 36.821900001651805°,
latitude -1.2921000053142353°. The online service instead returns longitude
36.82022478316998°, latitude -1.2866083622856117°, while claiming `0.001m`
precision. Native residuals against the originating synthetic point are about
1.65e-9° longitude and -5.31e-9° latitude. These compare implementations under
fixed parameters; they do not establish the operation's regional suitability,
surveyed control, receiver performance or field accuracy.

Source inspection explains relevant differences: the online implementation uses
WGS84 Cartesian/ellipsoid helpers for other datums, subtracts “to WGS84” parameters
in its own transform function, and uses the WGS84 UTM projection path for regional
targets. This audit does not rewrite or independently certify those formulas.

## Other source findings

- The request has one `zone`/`hemisphere` pair and broad `fromSystem`/`toSystem`
  names. It cannot express two distinct projected grids or select a regional
  coordinate operation. The UI defaults the hemisphere to north.
- Editing coordinate/system fields leaves a completed result visible. The async
  handler has no input revision or unmount guard. These are source findings,
  not newly executed browser-race acceptance tests.
- Truthy rendering conditions omit labelled zero latitude/longitude/easting/
  northing results. Zero may appear as an unlabelled React value instead.
- Batch elevation is copied without a vertical-treatment label; the schema
  rejects an explicit null elevation. Per-row success/error counts exist.
- Batch maximum is 1,000 in code, while the API description says 5,000.

Correct operation selection needs explicit references and context. PROJ's own
operation-query interface exposes operation accuracy, area of use and grid
availability rather than treating a broad datum name as a unique transformation:
[official projinfo documentation](https://proj.org/en/stable/apps/projinfo.html).
Its [transformation guide](https://proj.org/en/stable/usage/transformation.html)
also distinguishes the source/target ellipsoids and the intervening operation.
These references guide the proposed repair; they do not validate the application's
current parameter catalogue.

## Decision and evidence

An online-contract design decision is pending: explicit registered source/target
CRS selectors using the shared authority, or retained datum labels with separate
grid and operation controls. The existing brainstorming skill requires approval
before this interface change. No approved implementation spec is claimed here.

## Full ordinary Jest checkpoint

After the committed coordinate/GNSS repairs, the full ordinary Jest command
completed with **5,441 passed, zero failed, nine skipped**; **601 executed suites
passed**, three suites were skipped out of 604 total, and the existing snapshot
passed without updating. Jest reported 545.18 seconds. This does not include
Python or Node release-helper suites, and coverage was not collected.

The isolated runner excluded private dotenv values, disabled native DB opt-ins,
and used synthetic auth/database configuration with loopback port 1. The tested
source/config inventory was 2,909 files at `ad48667d41d10c3c09b74beca14c0dc60890b274`.
Before/after SHA-256 matched:
`c3be7bc42bf6c2a1dea94053ecd7cb031cbc848e0b67dde0d2f628727b6c8ed2`.
The runner exited 0 and confirmed unchanged tested source. The inventory includes
existing uncommitted survey-plan edits; it is not a clean isolated release artifact.
Audit documentation is outside that source/config fingerprint.

The nine skipped checks are one PostgreSQL restricted-role membership check,
one native field-sync rollback check, six PostgreSQL account-linking/MCP checks
and one observation-upgrade check. No pending synthetic DB approval was bypassed.
The printed fail-closed migration error is a negative unit fixture, not a failed
customer migration attempt. The `[axe]` log lines are route-selection test
fixtures, not live browser accessibility scans.

Evidence: `.cache/coordinate-suite.log`, `coordinate-suite-results.json`,
`coordinate-suite-inventory.json`, and `coordinate-suite-summary.json`.
This passing run leaves the reproduced online defects above unresolved; the
existing ordinary tests did not cover them. Green source tests are not deployment,
normal-account HTTP, regional operation or field acceptance.

Ignored evidence: `.cache/audit-online-transform.ts`,
`online-transform-jest.config.cjs`, `online-transform-audit.json`,
`online-transform-audit.log`, `audit-online-native.py`,
`online-transform-native.json`, and `online-transform-native.log`.
The probes are throwaway verification harnesses, not application features.

Production is unchanged in this pass. This service must not be counted as ready
because the separate transform engine has passing tests. Existing worker,
Fieldbook migration, recovery, provider/payment and device/field gates also remain.
