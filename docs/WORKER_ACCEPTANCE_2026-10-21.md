# Worker source acceptance and production artifact gap

## Current result

The source worker passes 58 tests with two network-dependent tests skipped.
Production passes the ordinary service-health check, but fails the new worker
artifact contract. No worker build, deployment, dependency installation, compute
request or restart was performed against production.

Read-only `npm run docker:verify` confirmed the application, worker, PostgreSQL,
Redis, collaboration and NTRIP healthy, backup running, and the successful
migration service using the application image. There is one application container
and no dated verification images/builders. The latest completed backup at the
check was `2026-10-21T12:33:15Z`; this is archive/header evidence, not a restore.

## Production gap

`npm run docker:verify:worker` inspected the owned healthy `metardu-worker` and
probed its exact immutable container ID:

- Container: `f86194410484340ad061c0fdc34bf9b6de6ac442c7be7d5336fd27321c668105`
- Image: `sha256:30e83e33403f9e5accb6eddeccb940ece69df71d4a7b27d69406bf96f453241a`
- Source files absent: `rtklib_baseline.py`, `pointcloud_processor.py`,
  `osm_feature_server.py`, `osm_streaming.py`, `osm_overpass.py`, `spatial_cache.py`.
- `main.py` and `requirements.txt` differ from this checkout. The checked
  `gnss_processor.py` hash matches.
- Distribution metadata absent: `laspy`, `lazrs`, `pyproj`.
- `parse_lidar` task declaration absent. Five older task declarations are present.
- `rnx2rtkp` is on the executable path. Presence does not establish correct output.

The command exits 1 for these artifact gaps. It uses stdlib file/hash, AST,
distribution-metadata and executable-path reads; no application module import,
secret read, database/cache open, HTTP compute request or native solver invocation.
AST declarations are static evidence, not proof that the live server registered a
route. Metadata presence does not prove dependency imports or version compatibility.
It compares the current checkout, including any source edits, rather than an
assumed release label. Nine files are checked; a passing result is not a complete
container provenance or feature-acceptance claim.

An earlier read-only AST inspection of the deployed baseline handler also found
the old repeated `-k key=value` arguments, base-before-rover input order, and no
explicit known base position. The current source instead writes a configuration
file, requires a known base and orders rover before base. No real baseline solve
was attempted here, so neither measured error nor successful correction is claimed.

## Host source verification

The host test environment uses Python 3.14.7, pytest 9.1.1, numpy 2.5.2,
FastAPI 0.141.1, pydantic 2.13.4, laspy 2.7.0, lazrs 0.8.2 and pyproj 3.7.2.
Only missing LAS/LAZ test dependencies were installed into the ignored local
test environment; no global package or production environment was changed.
CI selects Python 3.12 and the production image runs Python 3.11.16. This host
run does not replace Linux/image acceptance on the deployment version.

All 60 tests were collected: **58 passed, two skipped, zero failures**. Network
downloads were not opted in. Tests cover RINEX/navigation/SP3 parsing, solver
fixtures, fail-closed OSM errors, actual synthetic LAS/LAZ 1.4 parsing with CRS
and classification, missing CRS behavior, bounded uploads, RTKLIB CLI/config/
result contracts and worker task/router wiring. RTKLIB subprocess tests inject
a fake runner; closed-loop solver fixtures are not independent field accuracy
proof. The real 1LSU SPP fixture has a 15 m tolerance, not survey-grade acceptance.

An ignored harness runs the actual worker source, redirects only default cache
and log paths to an owned temporary directory, and closes only owned log handlers.
It leaves the existing `python_worker/osm_cache.db` intact. Before/after source
inventory and protected-cache hashes match; worker inventory SHA-256:
`45985530006de2d6f5b183a7d179654af5b64203388e50cd35988e7c487fe9ee`.

The initial sandbox run stopped progressing before its first asyncio OSM test.
A bounded `asyncio.run(asyncio.sleep(0))` probe timed out via its five-second
guard in the sandbox but completed on the host. Only the inspected, task-owned
test process pair was stopped. The host run completed in 3.54 seconds. The
incomplete sandbox log is retained and is not counted as a passing run.

The release-plan/upgrade helper suite also passed **13/13**; these are guarded
contract tests, not executed upgrades. The worker artifact guard passes **6/6**
tests covering absent/stale artifacts, malformed evidence, missing executable,
ownership/health refusal before exec and immutable-ID read-only probing. These
guard tests are included in the existing CI release-helper step; CI was not run
remotely in this pass.

Local diagnostic evidence (ignored, not customer data):

- `.cache/worker-source-tests.log`, `worker-source-pytest.xml`, `worker-source-report.json`
- `.cache/worker-source-tests-sandbox-incomplete.log`
- `.cache/worker-asyncio-sandbox-probe.log`, `worker-asyncio-host-probe.log`
- `.cache/worker-runtime-contract.log`, `worker-runtime-capabilities.json`
- `.cache/worker-contract-tests.log`, `release-contract-tests.log`
- `.cache/worker-acceptance-runtime.log`

## Release gates still open

Prepare one coherent worker artifact alongside the reviewed application release;
do not hot-patch the running worker or create another preview stack. Verify native
dependency imports, task registration and realistic LAS/LAZ workloads in that
artifact, plus an actual RTKLIB solution against independent known control. Keep
optional OSM dataset provisioning separate from router availability. Review the
worker's own exact rollback artifact and configuration as part of the same planned
promotion; the application rollback tag alone is not worker rollback evidence.

Fieldbook migration 115 and the separately pending synthetic DB/browser acceptance,
customer migration compatibility, backup restore, paid/provider workflows,
receiver/device tests and field pilots remain open. The broader engineering
platform is not finished by this source-test milestone.
