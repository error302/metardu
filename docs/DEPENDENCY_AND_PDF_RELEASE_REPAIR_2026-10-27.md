# Dependency, PDF and push-hook release repair

27 October 2026, Africa/Nairobi. Continuation of
`GITHUB_CHECKPOINT_AND_RELEASE_REVIEW_2026-10-27.md`, based on source checkpoint
`4bd9c2e426f185ce7cd5f80ae9b16c239dd6dc5d`. The production goal remains active.

## Dependency and packaging changes

The ordinary dependency audit reproduced the remote findings before editing:
runtime 3 critical / 5 high / 3 moderate; full graph 4 critical / 5 high /
4 moderate / 5 low. Original manifests and reports are preserved in the ignored
`.cache/dependency-release-review/` evidence folder.

Published compatible patches are selected in the reviewed lockfile:

| Package | Selected version |
| --- | --- |
| Next, @next/env, eslint-config-next | 15.5.28 |
| @sentry/nextjs | 10.75.2 |
| DOMPurify | 3.4.17 |
| Nodemailer | 10.2.1 |
| Puppeteer | 25.16.0 |
| body-parser | 2.4.0 |
| fast-uri | 3.1.9 |
| ip-address | 10.7.5 |
| serialize-javascript | 7.1.4 |
| postcss-selector-parser | 6.1.5 |

Puppeteer is now a required runtime dependency: the PDF renderer statically
imports it. The package declares Node 22 (>=22.12.0), `.nvmrc` records the checked
22.23.3 toolchain, and the CI/PR/nightly-math
Node-20 jobs now use Node 22. Package installation skips browser downloads;
Docker continues to use its explicitly installed Alpine Chromium, and Ubuntu
CI explicitly selects its managed Google Chrome executable. Runtime dependency
verification actually imports the selected Puppeteer library and retains the
existing native SVG, sanitizer, email-composition, XLSX, URI and other checks.

Fresh lockfile audits report **0 critical / 1 high / 0 moderate / 0 low** for both
runtime and full graphs. The remaining high finding is Zod. The ordinary gate
still exits 1; it has not been weakened or baselined away. The existing major-3
schemas require a deliberate migration to the patched major-4 contract, including
omitted/default fields, stored request hashes, error handling and untrusted-input
resource checks. Installing a new major or importing an old compatibility path
without those checks would not establish safe recovery or adoption.

These are package-advisory results, not proof of exploitability in every METARDU
configuration or proof that production already contains the patches. Source and
live artifacts retain separate acceptance boundaries.

## Actual PDF output repair

Native rendering with the installed managed Chrome exposed a real output error:
requesting landscape still produced portrait pages. A4 landscape returned about
596 x 842 PDF points; A3 landscape returned about 842 x 1191. The HTML stylesheet
hardcoded `@page size: A4 portrait`, conflicting with the requested print options.

The stylesheet now receives the declared paper size and orientation used by the
renderer. `tests/native-pdf-output.test.mjs` transpiles the actual production
module, renders through actual Puppeteer/Chrome, and independently parses the
resulting bytes with pdf-lib. Both landscape cases were observed failing before
the repair. All four A4/A3 portrait/landscape cases now pass, checking every page
within one PDF point of its nominal dimensions. The actual renderer also still
refuses HTML that attempts to load an external resource.

Synthetic PDF files and source/file hashes are retained under
`test-results/native-pdf-output/`. CI now runs this acceptance and uploads its
synthetic artifacts. Nominal PDF page geometry is not calibrated physical-print,
survey-scale, receiving-CAD or field proof.

## Empty print-shell export

The mobile build's `/print/survey-plan` failure was traced to the route itself.
It serves a constant empty landing document, with no request, cookie, project or
observation read. Its original same-origin viewer subsequently inserts a reviewed,
sanitized sheet. Declaring this constant shell `force-static` permits its static
export without pre-rendering client survey data or removing a server authorization
check. This corrects the earlier review's unverified assumption that it was an
authenticated dynamic print endpoint.

Existing sheet sanitization, physical-A3 markup and owned-window tests pass.
Full mobile packaging and a physical device/print journey remain separate gates.
The host mobile-build script was not run: its existing stale-stash deletion and
source-restoration behaviour require preservation review before it moves this
shared checkout's source directories.

## Correct ref selection for repeat pushes

The previous synchronized push invoked the hook with no new refs. The manual
fallback then invented an `origin/main...HEAD` range and scanned unrelated
historical work. The hook now reports no refs and exits for that Git-style
invocation. Manual checks retain their fallback, while actual source refs retain
security/schema/type/query/lint/secret/test commands and failure propagation.

Five real-Bash control-flow regressions pass. They use controlled Git ref input
and stub child commands; they are not substitute execution of the source gates.
The no-ref case was observed failing before the repair. A real, explicit push of
the already-published baseline then returned promptly with `Everything up-to-date`
and changed no GitHub ref. CI includes the regressions in its inexpensive ref/query
job. No skip variable, forced update or disabled hook was used.

## Verification and preservation

- A checksum-verified official Node 22.23.3 toolchain performed a clean locked
  host install. The owned source preview was stopped before replacing its
  dependencies. Canvas and SQLite native dependencies were rebuilt for Node 22.
- Runtime dependency admission and native SVG/sanitizer/email/XLSX/URI/codec
  checks pass. Email composition uses a local stream transport; none was sent.
- Native PDF acceptance passes 5 checks. The adjacent Jest groups pass 27 tests
  across 7 suites. Packaging, computation-PDF wrapping and hook control-flow
  acceptance pass 14 Node tests. Test groups retain their stated scopes.
- Strict application and test TypeScript, scoped source ESLint, workflow YAML,
  Node syntax and whitespace checks pass. The security invariant gate retains
  all 119 pinned applied migrations and checks 765 test / 3340 source files.
- Host compilation and preview-resumption outcomes are recorded below.
  A Windows source build does not verify the Linux candidate,
  PWA, installed mobile package or customer workflow.
- Read-only production verification passed before work: one owned application,
  required supporting services and matching successful migration bootstrap.
  Backup completion `2026-10-27T02:00:03Z` remains archive/header evidence.

## Remaining release work

Close the Zod migration, native capture/reference regression failures, complete
lint resource/coverage checks, web/mobile/PWA and ordinary-account acceptance.
Review nine pending migrations 115–123, customer recovery and the actual rollback
artifact/registry, and select matching app/worker/migrator artifacts before one
promotion. Worker drift, the owner-deferred signing-key rotation, paid/provider,
admin/phone, independent surveyor, instrument/field/CAD/print and ward-scale
campaign/crew gates remain open. Preserve deployed parcel containment and the
localhost CAD training drawing.

## Host build and preview outcome

The isolated-environment Next 15.5.28 host build completed with exit 0 on Node
22.23.3 at `2026-10-27T13:44:34Z`, including generated-route type validation and
218 generated static pages. No application/container was started by that
compilation. Private dotenv values were overridden with disabled providers and a
deliberately unavailable build database. PWA was disabled to match the CI web
compilation; this does not establish the deployable Linux/PWA candidate.
A subsequent metadata-only edit constrained the declared Node engine to major 22
and added `.nvmrc`; runtime source and selected dependency versions were unchanged.
The final pinned promotion artifact still requires its own build and admission.

Ordinary standalone preparation completed. Its guard removed one generated dotenv
copy from the owned output and verified no bundled environment files remained.
Static/public assets, PDFKit metrics, native Canvas/PDF.js bindings and Sharp
metadata were prepared using the existing guarded paths. Packaged Puppeteer and
Puppeteer Core resolve inside the generated standalone tree. A process running
from that tree imported Puppeteer and produced a 15,968-byte synthetic PDF using
managed Chrome 155.0.8059.85; it started no application server. This is bounded
packaging/native-renderer evidence, not full route, Linux or customer acceptance.

The build reports existing JSON named-import compatibility warnings in
`src/lib/scheme/exportArtifact.ts` for dependency version metadata, plus Webpack
cache serialization warnings. The former should be reconciled with default JSON
imports and the retained export/provenance tests before future compiler changes;
the warning itself is not proof that stored export metadata has changed.

The first source-preview restart exited on a Windows open error after its
generated type declaration was restored during startup. Its logs were preserved
and terminal state confirmed. The same original preview launcher was restarted
on the same loopback origin with the checked Node 22 toolchain. The second
attempt reported Ready in 11.1 seconds. The first cold print request
timed out while the dev server compiled; subsequent health and empty-print-shell
requests both returned 200 in about 0.7 seconds. This is anonymous loopback HTTP
evidence, not browser, account, mobile or physical-print acceptance. Generated
cache-directory type declarations were restored only after startup and compilation.
The owned CAD drawing and page storage were not edited. Use Node 22 for this
checkout's installed native modules; no system-wide Node configuration changed.
