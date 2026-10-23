# Worker/application release hardening

Date: 23 October 2026 (Africa/Nairobi).

This implements the first release-integrity batch from
`PRODUCTION_AND_INTERNATIONAL_READINESS_RECOMMENDATIONS.md`. It does not complete
the broader production goal or international survey acceptance.

## Reproduced defects

The ordinary production runtime verifier passes with host Docker access, but
`docker:verify:worker` reports older/missing source artifacts and dependencies.
In particular, a healthy worker can predate the corrected relative-baseline
wrapper and bounded LAS/LAZ parser. Health is insufficient to select those tasks.

New bridge regressions also reproduced acceptance of HTTP-200 JSON `null`, an
array, an empty object, a missing/nonboolean success flag and missing/null data
as successful computations. A missing worker credential still attempted network
dispatch. Body-read cancellation was misreported as invalid JSON or incompatible
capabilities rather than a timeout.

The first regression run failed 19 bridge checks with eight existing checks
passing. Three new Python boundary checks failed against the old worker source.
Later HTTP acceptance reproduced the missing cache-control header; two further
bridge regressions reproduced cancellation misclassification. The source repairs
follow these failures; no running worker was patched.

## Implemented behavior

- The app and worker share `python_worker/compute-contract.json`. It identifies
  transport/implementation compatibility for relative-baseline and LAS/LAZ
  preview processing, not field certification or established absolute accuracy.
- Authenticated `GET /capabilities` advertises only registered task contracts
  and uses `Cache-Control: private, no-store`. Unauthenticated liveness remains
  separate.
- The app checks capabilities without sending observations, does not cache
  admission across worker replacements, and refuses absent/incompatible workers.
  Admission has a five-second cap within the overall request deadline.
- Admitted requests carry the selected contract. The worker refuses a supplied
  incompatible contract before invoking a handler. The app requires a successful
  response to name the admitted task and contract, protecting the response boundary
  if a worker changes between admission and execution.
- Older app callers can still use the updated worker without the additive
  contract field. The corrected baseline handler independently requires its known
  base/input contract; the compatibility field is not a substitute for validation.
- Every successful bridge result requires a JSON object, literal `success: true`
  and non-null/non-missing data. Task/transport failures remain failures, and
  response-body cancellation retains timeout semantics.
- Missing credentials stop dispatch locally. Input objects are not mutated.
  Compatibility errors explain that processing is unavailable and the input was
  not submitted. No replacement measurements are produced.
- The read-only artifact verifier now also hashes the shared JSON manifest.
- `METARDU_WORKER_IMAGE` permits explicit worker image selection; its default
  matches the existing compose image name. Production configuration is unchanged.
- The remote deploy workflow now checks worker artifacts before declaring its
  release successful. This added check does **not** make the pre-existing broad
  compose deployment sequence a reviewed promotion/recovery plan.

## Linux artifact gate

The worker Dockerfile's default final runtime depends on an acceptance build
stage using its actual Python/runtime dependencies. That stage runs the full
ordinary Python suite, actual ASGI authentication/dispatch and synthetic LAS/LAZ
parsing, then the maintained native RTKLIB reference suite. Missing RTKLIB is a
failure in the native suite. No service or test container is started.

The final image inherits the non-root runtime and copies only a small acceptance
receipt from the test stage. Test tooling, fixtures, generated cache/database
and logs are not copied into the final image. The worker-specific build-context
allowlist excludes existing local caches, logs and other device/source work.

The candidate uses the reusable `metardu-metardu-worker:candidate` tag and the
existing Docker builder. No dated verification image, additional builder,
production restart, customer clone or database migration is part of this work.

## Evidence and remaining acceptance

The isolated host Python suite passes 91 tests with two network checks skipped.
This includes actual FastAPI ASGI middleware/dispatch and unmocked decoding of
small synthetic LAS and LAZ files, retaining zero/negative coordinates and
unknown CRS. The harness verifies unchanged worker source and the existing
`python_worker/osm_cache.db`; its caches/logs are redirected to owned temporary
paths. Host Python differs from the Linux deployment runtime.

The focused bridge/API suites pass 47 checks. The release/runtime helper suite
passes 19 checks. These are separate scopes, not proof of a production GNSS job.
Both TypeScript projects and scoped lint are required again after final source
changes. The first ordinary type check encountered disappeared generated preview
files; a nonincremental application check and separate test check subsequently
passed without changing the preview or weakening the configuration.

Ignored evidence: `.cache/worker-contract-red.log`, `worker-contract-green.log`,
`worker-contract-http-red.log`, `worker-contract-http-green.log`,
`worker-native-source-report.json`, `worker-native-pytest.xml` and
`worker-candidate-build.log`. Build/source final results are recorded below.

Production remains the existing app/worker/supporting stack. A coordinated
promotion still requires reviewed source and artifacts, exact worker and app
rollback protection, migration/customer compatibility and recovery evidence.
The rejected customer-clone gate and deferred signing-key rotation remain intact.
Ordinary authenticated application/browser acceptance on the promoted revision,
physical receiver/device checks, independent control/height accuracy, customer
uploads/offsite/key recovery and paid lifecycle remain separate open gates.

## Completed candidate checkpoint

The default Linux build completed successfully using the existing builder and
the reusable candidate tag. Its actual runtime-dependency stage passed **91
Python/ASGI tests, two network checks skipped**, followed by **five native RTKLIB
reference checks, zero skipped**. FIX/FLOAT, base-coordinate sensitivity,
single-point rejection and configuration-diagnostic rejection executed the real
binary. These reference regressions are not independently surveyed field proof.

Candidate image: `sha256:d61ae9e361383626cb5b4162ab553c41362413b957d5795c57bad014fd5321ee`.
Inspected runtime user: `worker`. Both ordinary TypeScript checks, scoped ESLint
and the final 47-check bridge/API run passed. The 19 release-helper checks and
YAML parsing of the edited workflows/compose also passed. Whitespace checks
passed. A full Next production build and remote CI were not run in this batch.

Post-build read-only production verification passed again: one application,
required supporting services, matching application/migration image and healthy
HTTP/database/Redis. The running worker remains container
`f86194410484340ad061c0fdc34bf9b6de6ac442c7be7d5336fd27321c668105` on image
`sha256:30e83e33403f9e5accb6eddeccb940ece69df71d4a7b27d69406bf96f453241a`.
Its artifact check correctly still fails against the newer source, including
the missing shared contract. The candidate is built, not promoted. No service
was started, stopped, replaced or hot-patched by this batch.

## Source integration review

The follow-up review re-ran all 47 bridge/API checks and all 19 release-helper
checks successfully. Compose and both edited workflow files parse successfully.
The current read-only production health check passes, while the worker artifact
check exits one with the expected missing/stale artifacts against the same
deployed worker identity above. This disagreement is intentional: liveness
does not establish compatibility, and the candidate remains unpromoted.

The subsequent Windows application production-mode build includes this bridge
and shared manifest, passes compilation/generated-route validation and generates
219 static pages. Standalone artifact inspection found and repaired a separate
custom-build-directory browser asset defect. See
`APP_PRODUCTION_BUILD_2026-10-23.md` for the exact input, preservation and platform
limits; this is not Linux application/PWA runtime acceptance.

The worker integration commit stages only its Python CI dependency change in
the shared CI file. The concurrent document-register CI changes remain with
their own source work. No production command in the deploy workflow was executed.

The fresh isolated host Python/ASGI run passes 91 tests with the same two
network-only skips. Its report again confirms unchanged worker source and the
protected existing OSM cache. The first restricted run stalled at the first
ASGI test: a separate bounded asyncio-only probe showed Windows blocking in
`socket._fallback_socketpair` during event-loop initialization. The host-access
probe passed. After checking executable paths and exact process start times,
only that owned verification process pair was cancelled and confirmed terminal
before the host retry. The restricted log is retained as
`.cache/worker-commit-python-restricted.log`; the successful run is
`.cache/worker-commit-python.log`. No solver or authentication check was weakened.
Both TypeScript projects and scoped bridge ESLint also pass in this review.
