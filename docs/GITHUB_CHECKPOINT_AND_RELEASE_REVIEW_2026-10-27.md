# GitHub checkpoint and release review

27 October 2026, Africa/Nairobi. This records the owner's request to commit all
remaining work, upload the branch and check site behaviour before continuing.
It does not close the production goal in `PRODUCTION_GOAL.md`.

## Source checkpoint

Branch: `codex/metardu-workflow-readiness-2026-10-12`, remote:
`https://github.com/error302/metardu`.

- `10beb146`: latest road corridor separation source milestone. Its recorded
  496 tests / 52 suites and earlier native/browser receipts retain their exact
  source and dependency boundaries.
- `5de430b6`: preserves the remaining credibility, readiness and marketing
  records. The marketing files are historical campaign plans, not a new
  publication, payment or outreach instruction.
- `7cd162e7`: fixes quality checks found by the first attempted push. It types
  46 database queries across ten routes, admits client instrumentation and two
  existing verification tools to typed lint projects, removes unsafe assertions
  from the settings tests, and repairs an obsolete set-out transaction fixture.
  Queries, ownership checks, runtime response validation and SQL are retained.
  The export verification tool was linted, not executed against customer data.

The generated `next-env.d.ts` preview-cache reference was returned to the
standard `.next/types/routes.d.ts` path; the original `tsconfig.json` dirt had
no content difference. No user drawing, ignored private QA credentials, applied
migration or production service was discarded to obtain a clean worktree.

The first push was correctly blocked by the local hook. The repaired 51-route
query-type gate passes. Focused settings/set-out tests pass (11 tests). Targeted
lint passes with eight diagnostic-script console warnings. The broader changed
file lint subsequently passed with zero errors and nine console warnings.
The retry passed every local hook and uploaded the exact `7cd162e7` revision.
All seven related-test batches passed, with respective passing-test counts of
469, 229, 413, 3270, 3013, 1226 and 717. These batches overlap; adding them would
not give a unique test count. Opt-in suites retained their recorded skips.
Remote CI results are recorded below; local checks are not a production build.

A checksum-verified official Gitleaks v8.24.3 executable was used in the ignored
task evidence folder. The first 74-commit range scan found no new leaks. The
retry also makes the scanner available to the normal pre-push hook without a
persistent PATH or hook configuration change. This does not clear previously
documented credential-rotation debt.

## Site and runtime observations

Evidence is kept under the ignored `.cache/github-release-review/` folder.
These observations are bounded checks, not continuous monitoring.

- Three anonymous HTTPS samples at 12:06:52–12:06:56 UTC: `/`, `/login`,
  `/pricing`, `/demo` and `/api/health` returned 200. `/dashboard` and `/admin`
  returned 307 to login with their requested destination preserved. These
  responses do not verify a signed-in dashboard or administrator workflow.
- The public release health endpoint at 12:41:39 UTC returned 200 with healthy
  database/cache/disk checks, but both `releaseId` and `X-METARDU-Release` were
  `unknown`. Version `1.0.1` alone cannot identify a deployed source revision.
- Read-only Docker inspection identifies the running app image as
  `sha256:06103336484035d2aad7d3a1d45cf9bb37b8a814507b190108f5ae1586a9d0b0`,
  labelled source `08fae42763aae6d6c4fa24e7f32ec359bf41ddc7`.
  Its runtime `METARDU_BUILD_SHA` remains `unknown`.
- The current source preview's landing page renders an explicit Dashboard
  entry. Clicking it reaches `/login?next=%2Fdashboard`. The synthetic road
  example loads its plan, 3D, profile and section controls. Moving to the next
  measured section changes chainage 0 to 20 m, easting to 500020.000 m, target
  level to 100.400 m and cut area to 3.871 m². This is an anonymous synthetic
  source UI check. The browser connection ended before a full visual/phone or
  signed-in review; no new screenshot or account acceptance is claimed.
- The corresponding public HTML did not contain the new Dashboard or visual
  road-example labels. Together with image identity, this confirms that the
  new source milestone has not been promoted to the advertised site.
- `npm run docker:verify` passes: one application, required supporting services,
  matching successful migration bootstrap, HTTP/database/cache health. The
  reported backup completed `2026-10-27T02:00:03Z`; that proves archive/header
  checks, not an actual customer/offsite restore.

## Why a push is not yet a production promotion

Fresh read-only ledger comparison finds 119 applied migration records, zero
mutated hashes and zero unknown applied versions. These nine source migrations
remain unapplied:

1. `115_fieldbook_delivery_revisions`
2. `116_surface_request_recovery`
3. `117_scheme_import_receipts`
4. `118_block_identity_retention`
5. `119_reviewed_parcel_boundary_drafts`
6. `120_scheme_export_requests`
7. `121_parcel_draft_sharing`
8. `122_retained_parcel_traverses`
9. `123_boundary_request_recovery`

The existing pinned-release helper still admits an older pending-migration
allowlist. Its contract must be reviewed against the chosen release and actual
upgrade evidence, not relaxed simply to get a deployment through.

The live worker artifact verifier fails: source/requirements differ, baseline,
point-cloud and OSM modules and the compute contract are absent, package metadata
for laspy/lazrs/pyproj is absent, and `parse_lidar` is not declared. Worker health
does not establish compatibility with the newer app.

The inspected `rollback-current` tag resolves to image `604238eef9cd…`, whereas
the running app is `061033364840…`. A rollback must be reviewed and pinned to the
actual current production artifact and compatible migration registry before
promotion. No tag was overwritten during this review.

Branch pushes trigger CI; the production workflow targets pushes to `main` and
uses a VM SSH deployment path. That workflow is not proof of a promotion into
this host's inspected stack. No merge to main, workflow dispatch, image build,
customer clone, migration or service replacement is part of this checkpoint.

## Ordered remaining work

| Priority | Next work | Evidence required to finish |
| --- | --- | --- |
| 1 | Repair the newly observed CI/security failures and select one coherent release | Resolve dependency advisories, PDF packaging, full-lint resource use and native database contract failures. Obtain terminal CI results, then review app/worker/migrator artifacts and upgrade/rollback contracts. Preserve other branches and separately review outstanding automated PRs. |
| 2 | Close customer recovery and migration compatibility | Resolve the previously rejected clone/rehearsal boundary through an authorized recovery plan; demonstrate required database/uploads/configuration recovery in an isolated owned target. Preserve original hashes and customer records. Synthetic fixtures are not a substitute. |
| 3 | Promote once and prove its identity | One reusable candidate, verified current-production rollback, normal migration dependency execution and public release SHA matching the selected commit. Then repeat the actual ordinary-account journey on that revision. |
| 4 | Complete page and UI acceptance | Landing → dashboard → existing/new project → control/import/fieldbook → map/drawing/terrain → calculations → review/export; reload/interruption/error states; settings/billing/team/admin access; desktop and physical phone layouts. The current anonymous checks cover only a small part of this matrix. |
| 5 | Complete the defined topographical pilot | Real instrument files, declared horizontal/height reference and control, retained original observations, checked terrain/contours and revision-bound CAD/PDF/data delivery. Independent surveyor, receiving CAD, printer and physical field checks remain required. |
| 6 | Finish road and large-job workflows | Event-aware whole-road terrain quantities, continuous daylight and convergence/error review, issued road revisions and validated interchange/setting-out. Test campaign/crew partitioning, concurrent edits and interruption recovery under representative ward-scale loads. |
| 7 | Prove paid operations and international job support | Provider purchase/renewal/refund/entitlement and support acceptance; explicit jurisdiction/reference/instrument/file-version support backed by a named foreign pilot. Marketing plans do not establish these capabilities. |

The owner-deferred signing-key rotation remains an open P0 security blocker.
Honor that deferral; never use the exposed key as a rollback. Preserve the
deployed public-parcel containment and the localhost CAD training drawing.

## Upload and CI outcome

The GitHub branch was independently read back at
`7cd162e714c82ea84272b9a01732100b74ea243b`; 75 local commits were uploaded from
the previous remote tip `0254722c`. Main was not changed.

[CI run 40506769506](https://github.com/error302/metardu/actions/runs/40506769506)
has confirmed failures. The API query-type gate, strict app/test TypeScript
(including PDF and 3D Webpack parser checks), Python/native worker tests and i18n
check passed. The separate
[secret scan](https://github.com/error302/metardu/actions/runs/40506769459) passed.
Both Python and JavaScript/TypeScript jobs in
[CodeQL run 40506769486](https://github.com/error302/metardu/actions/runs/40506769486)
also completed successfully.
These results do not mean the complete CI workflow passed.

Confirmed failures and next diagnostics:

| Check | Observed failure | Next work |
| --- | --- | --- |
| Dependency security | Runtime: 3 critical, 5 high, 3 moderate. Full dependency graph: 4 critical, 5 high, 4 moderate, 5 low. The ordinary audit script reproduces both results locally. | Review and upgrade affected direct/transitive packages with retained dependency/runtime tests. The audit counts package advisories; they are not proof that every exploit condition occurs in METARDU. Do not weaken the audit gate or blanket-run a forced major upgrade. |
| Production build | Webpack cannot resolve the statically imported optional `puppeteer` in `src/lib/pdf/generatePdf.ts`. | Reconcile required PDF runtime packaging, managed Chromium and the supported Node version. npm metadata confirms Puppeteer 25.10.0 requires Node >=22.12.0; several CI jobs still use Node 20 while the Docker base uses Node 22. Engine mismatch is verified; the exact optional-install omission still needs its install diagnostics. |
| Design/set-out native SQL | `verify-design-revisions.mjs` stops on `setout_capture_snapshot_shape` during its capture cases. | Compare fixture and actual capture writer/constraint contracts; reproduce on the owned isolated database and keep all historical hashes and checks intact. Earlier deliberate SQL errors in that log are negative-test evidence, not all separate failures. |
| E2E database preflight | All four shards stop in `verify-surface-runtime.mjs` at `legacy defaults cannot replace an explicit project reference`. Browser E2E does not run past this preflight. | Inspect actual request/response and current retained-request/reference admission, then repair the contract or fixture based on evidence. Do not relax the reference assertion to obtain green CI. |
| Whole-repository lint | Fail-fast process aborts with V8 heap exhaustion near 4 GB. | Bound lint program/resource use and prove complete file/rule coverage; no skipped files, warning-floor inflation or suppressed checks. |
| Mobile build | Static export stops at `/print/survey-plan`, whose dynamic server route has no static-export configuration. | Reconcile the mobile route/server-feature boundary and validate its intended online/offline print path; do not mark a dynamic authenticated print endpoint force-static to hide the error. |
| Tailwind utility | One dead loading/error background class in `RoadWorkbench3D.tsx`. | Repaired after this run with an explicit 95% `color-mix`. The ordinary whole-source class gate now passes, and an actual Tailwind compiler check emits the background CSS. Scoped ESLint passes. This repair is separate from the earlier browser observation; fresh rendered acceptance remains open. |

The dependency review verified the published fixes for
[Next 15.5.28](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
[Sentry 10.75.2](https://github.com/getsentry/sentry-javascript/security/advisories/GHSA-mchm-gjx6-7h55),
[DOMPurify 3.4.17](https://github.com/cure53/DOMPurify/security/advisories/GHSA-mrv2-3pqr-j5jr)
and the [Zod 4.6.6 advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
The existing Zod dependency is on major version 3; its migration needs explicit
schema/API/error compatibility and untrusted-input tests. Other flagged packages
include body-parser, Puppeteer/Chromium BiDi, fast-uri, ip-address and Nodemailer.
No dependency version was changed in this checkpoint. The Next advisory includes
a sharp-version workaround and Sentry lists specific tunnel/auth conditions;
neither advisory count alone establishes actual exploitation.

Remote Jest/coverage and accessibility status
must be read to terminal before accepting the complete run. Further documentation
or the CSS repair does not erase the above failed run or establish a deployment.
