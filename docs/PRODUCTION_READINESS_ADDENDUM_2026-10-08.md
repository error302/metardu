# Production-readiness follow-up: engineering records, build and OAuth

## Build dependency defect

The existing installation and lockfile omitted `webpack`, although
`@ducanh2912/next-pwa@10.2.9` and `workbox-webpack-plugin@7.1.0` require it as a
peer dependency. This repository sets `legacy-peer-deps=true`, and Docker/CI
use `npm ci --legacy-peer-deps`, so npm does not install that peer automatically.
Loading `next.config.js` reproduced `Cannot find module 'webpack'` through the
Workbox/PWA import chain, even when PWA generation was disabled.

Added `webpack` as an explicit development/build dependency and updated the
lockfile using npm. `npm ls webpack --depth=2` now reports version 5.111.1 shared
by PWA, Workbox, and Sentry; it satisfies the installed Workbox peer range.
The real Next configuration now loads and its five additional private cache
rules can be evaluated without mocking plugin wrappers. This establishes the
dependency repair, not a successful production build.

The analyzer was retried after the repair. It reached production compilation
but did not advance during the observed run and was stopped. No complete
analyzer report or deployment was produced. Earlier Windows route-output
`EPERM` failures remain separate from the missing-peer defect. The next build
gate is a clean Linux CI/Docker build followed by the route bundle budget and
runtime workflow checks. The local host is Node 26.4.0; its installed
`better-sqlite3` package does not list Node 26 as supported. Docker already uses
Node 22; reproduce the final release checks with that runtime.

The workspace-local npm download cache is now excluded from Git and Docker.
Archived marketing concepts are excluded from the Docker build context, and
the archived PNG originals are explicitly permitted in Git so they remain
preserved rather than silently disappearing at commit time.

## OAuth account identity defect

The previous callback computed a provider-email-verification flag but did not
enforce it when linking an existing account. Five callback regression cases
failed against the previous implementation, including an unverified Microsoft
email gaining access to a verified password account and Google sign-in being
accepted without an email-verification claim.

The callback now resolves an already stored provider subject before an email
match, retains the METARDU account identity when provider email changes,
rejects duplicate or conflicting provider identities, and requires verified
ownership on both sides of an automatic email link. The provider/subject pair
is stored together when a password account is first linked. This uses the
existing migration 016 columns and indexes; no new schema was introduced.

Microsoft email claims never qualify for automatic email linking. Google email
linking requires a verified Gmail address or matching hosted-domain claim.
Other Google addresses require a separate ownership challenge; an already
linked subject can still sign in. New Microsoft identities can register as
ordinary users, with `email_verified=false`, without inheriting another
account's projects or privileges. Tests also reproduced a suspension-query
failure granting OAuth access; that failure now denies sign-in.

NextAuth errors return to `/login`, which provides a general recovery message
and directs users to an existing sign-in method or support without displaying
provider error details. This change does not implement a new authenticated
multi-provider linking interface; that remains required for adding a second
provider where email is not authoritative.

These decisions follow [Microsoft's ID-token claim guidance](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference)
and [Google's email-authority guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
NextAuth continues to perform the OAuth protocol/token validation; the tests
here exercise METARDU's application callback and mock database results.

## Release evidence still required

Local verification: 3 auth suites / 26 tests passed on the final callback code,
covering identity linking, suspension failure, session revocation, and safe
redirects. `npm run typecheck` passed for both the app and separate test
projects. The new callback tests first reproduced the original unsafe links
and suspension fail-open behavior before the fixes. `npm ls webpack --depth=2`,
real Next configuration loading, private-header evaluation, config syntax, and
scoped `git diff --check` also passed. Callback tests use a mocked database and
do not prove real provider redirects or PostgreSQL execution.

Run a deployed HTTPS callback with dedicated Google and Microsoft test users;
verify provider-console callback URLs, state/cookie handling, account creation,
returning subjects, account email changes, denied linking, suspension, session
revocation, and isolation from a second user's private projects. This local
work does not establish that the production callback or ChatGPT connector has
passed that flow. The ChatGPT integration's separate consent, refresh,
revocation, scope, and tool tests remain in `docs/chatgpt-integration.md`.

Do not mark the platform production-ready until the broader P0 release,
database isolation, worker, backup/restore, and physical-device offline
requirements are verified against the shipped build.

## Stake-out cut-sheet integrity and usable exports

The standalone `/tools/stakeout-report` could previously show PASS for missing
levels and 100% acceptance for an empty dataset. Its initial form also supplied
invented surveyor credentials and observations; blank or malformed numeric
inputs could become zero. These are evidence defects, not presentation details.

The report now delegates comparisons to the shared engineering set-out engine.
It requires an explicit projected metre CRS and a tolerance reference, validates
finite coordinates and positive tolerances, and distinguishes PASS, WARN, FAIL,
and NOT ASSESSED. Vertical assessment requires the entered vertical datum and
both levels. Missing required levels or datum, a reported precision of zero
(unknown), and precision too coarse for the criterion cannot earn acceptance.
Absent precision is disclosed and does not establish an instrument accuracy
claim. Empty reports cannot pass.
An explicitly horizontal-only assessment remains possible. Judgments use
unrounded values; print offsets retain sub-millimetre detail.

The form starts empty, preserves blank measurements, removes unsupported
industry tolerance presets, and disables export immediately when inputs become
invalid. Examples are opt-in and visibly synthetic. CSV import rejects missing
or invalid measurements, duplicate identifiers, malformed headers, and excessive
input; quoted notes survive import. Invalid imports preserve the current data.
Editing and results use 50-row pages while calculations and exports include all
observations. No source capture time or professional identity is invented.

Draft HTML exports include the entered CRS, vertical datum, design revision,
tolerance reference, per-point evidence and assessment reason. Print styles use
repeating table headers, readable text, and A4 landscape output. The verification
script generated an actual engine report for 100 synthetic drainage points:
97 PASS, 1 FAIL, 2 NOT ASSESSED, overall FAIL. The six-page PDF retains the final
point and explicitly identifies the dataset as synthetic. Local artifacts are
in `test-results/stakeout-print/`; regenerate with
`node scripts/verify-stakeout-print.mjs` using installed Chrome.

Local verification: four focused suites / 43 tests passed, including component
interactions, CSV parsing, cut-sheet evidence, and the shared set-out engine.
The missing-datum regression failed before its correction. Script syntax checks
passed. `npm run typecheck` passed for both the separate app and test TypeScript
projects on the final changes. An explicit development dependency on `@testing-library/dom`
repairs another mandatory peer omitted by the legacy-peer installation mode.

The Next.js preview did not serve the report within the browser navigation
timeouts, including a retry with server and browser in one helper process.
Those preview servers were stopped. This pass therefore does not establish
desktop/mobile app rendering or production behavior. The local HTML was rendered
and printed successfully through Chrome, and its full table was visually
inspected. This standalone report still uses manually entered/imported evidence;
connecting it to persisted project observations, authoritative design revisions,
and project access controls is a separate remaining workflow gate. No deployment
or claim of certified survey output was made.

## Design revision history: database-proven defect and repair

Before wiring project observations into cut sheets, the design register was
tested against an isolated PostgreSQL 16 database. The original writer's second
save failed with migration 076's `design_revisions are append-only` trigger.
Its queries also interpreted a backward `supersedes_id` link as an active-row
marker and attempted to reverse that link on the old record. Each query ran
separately, so the rejected retirement could leave a partially appended history.

The writer now locks a project/discipline/entity stream, reads its full history,
and retires the previous active row and appends its successor in one transaction.
A failed insert restores the previous current revision. Revision numbering
continues through voided records; separate disciplines have independent chains.
Current lookups use lifecycle status and reject ambiguous discipline selection.
The backward predecessor link is never changed. Evidence events are emitted
after the revision transaction commits.

Forward migration `095_design_revision_lifecycle.sql` preserves the old migration
and existing evidence. It permits only retirement status changes; payloads,
hashes, revision identity, approval metadata, and predecessor links stay immutable,
and deletion stays prohibited. Database constraints/insert guards enforce one
active revision, unique sequential numbers, and an unbranched predecessor chain.
A valid partial append from the old writer can retire its recorded predecessor
without rewriting either record's content. Duplicate numbers or invalid links
stop the migration for reviewed correction rather than inventing history.
This change does not implement an approval interface or certify a design.

`node scripts/verify-design-revisions.mjs` runs the actual TypeScript register
against a fixed disposable database on local port 55432. It applies the original
design schema and the forward migration. Only the additive evidence-event writer
is substituted; the revision queries, triggers, indexes, transactions, and view
execute in PostgreSQL. Verified cases include three sequential saves, twelve
simultaneous saves (including differently cased project UUIDs), immutable original
content, preserved current revision after a failed append, resumed numbering at
R16 after a void, independent disciplines and ambiguous lookup rejection, valid
partial-history repair, and duplicate-history rejection. The saved result is
`test-results/design-revisions/result.json`. The same regression is configured
as a separate PostgreSQL service job in `.github/workflows/ci.yml`; the workflow
YAML parsed locally, but a hosted CI run has not occurred.

The related revision/offline contract and project set-out suites passed (17
tests), as did the drainage set-out route suite (13 tests). Both app and test
TypeScript checks passed. This database exercise used minimal prerequisite
project/user tables and does not prove the complete migration chain, deployed
database access policies, or end-to-end project/document workflows. Migration
095 has not been applied to METARDU's running database. Review and back up its
history before deployment; an ambiguous existing chain needs an explicit forward
repair. The caller atomicity defects identified in this pass are addressed in
the follow-up below. Complete capture evidence and project-connected printable
cut sheets remain required release work.

## Atomic saves and saved set-out history export

Six route regressions reproduced successful HTTP responses after required
design history, computation records, or QA records failed. Alignment saving now
uses one transaction for its row and revision. Field-to-finish saving uses one
transaction for project results, the boundary revision, the computation record,
and every QA result. These writers accept the same transaction client and defer
additive timeline events until after commit. A filtered-out or conflicting
project update cannot create a successful revision. The project update also
checks the `updated_at` token read before computing; this is not a complete
observation-batch concurrency guard.

Saved reference-system declarations govern these paths through the shared
reference resolver. A corrupt/display-only declaration blocks saving instead
of falling back to legacy zone fields. Alignment metadata and revision CRS use
the authoritative projected CRS, rather than recording a datum name as a CRS.
The pipeline now separates its input revision from its output design revision;
hashes cover the complete calculation input/CRS and result rather than omitting
heights, correction inputs, and other calculation parameters. It returns the
saved design, computation, and QA identifiers with the result. Failure responses
do not expose database error details or claim a partial successful save.

QA records no longer claim an attached tolerance profile when the calculation
used engine presets. Linear misclosure has INFO status when no issued absolute
limit was applied; precision checks use the selected survey type's engine
preset, with jurisdiction/project review explicitly required. This does not
verify those presets as current statutory requirements or implement project-
issued traverse criteria.

`/field/setout` now links to a private CSV export of the selected definition's
saved observations for its displayed design-point revision. The export includes
all saved re-stakes, including failed shots, coordinate/level differences,
recorded errors and limits, tolerance version, instrument/operator details,
observation/account/device identifiers, and the server recording timestamp.
Missing levels stay blank and zero reported precision stays zero. Text cells
are escaped against spreadsheet formula execution. Authenticated project access
and project/definition/revision SQL filters protect the query; successful CSV
responses explicitly use `private, no-store` headers. Empty exports return an
error, and more than 10,000 matching observations require a narrower selection.

The export deliberately identifies statuses as recorded history. Stored shot
coordinates have millimetre resolution, so recalculating a verdict from them
could erase a near-limit warning made at capture. Capture CRS and device capture
time are not separate immutable observation fields yet. The CSV therefore labels
the current definition CRS separately, declares that capture CRS was not stored,
and calls `staked_at` the server recording time. Device-only shots are excluded
and the page discloses that exclusion. This CSV does not certify acceptance or
replace the remaining project-connected printable cut-sheet workflow.

The isolated PostgreSQL verifier now runs the actual transaction-aware revision,
computation and QA writers against their migration-defined tables. Failed
revision, computation, and second-QA-result inserts preserve the prior project
value, current revision, computation count, and QA results together; no
pre-commit timeline event is emitted. It also executes the actual saved-shot
export query against the set-out tables, verifies revision selection, retained
history, missing levels, negative offsets, formula escaping, and exclusion of a
different project scope. The synthetic review CSV is
`test-results/design-revisions/synthetic-setout-history.csv`. The CI PostgreSQL
job now covers these checks as well. Its hosted run and the application's real
deployed authentication/RLS/browser flow remain unverified.

Local verification on the final source: four focused suites / 44 tests passed,
including saved-shot export, atomic save failure handling, declared-CRS precedence,
and field-page interactions. `npm run typecheck` passed for both app and test
projects. Scoped lint passed after correcting the test fixture's restricted CRS
literal. Script syntax, workflow YAML parsing, and scoped diff whitespace checks
also passed. The disposable PostgreSQL container and its temporary volume were
removed after saving the verification artifacts; running METARDU services were
not modified by this database exercise.

The capture snapshots and saved-history printable report identified as next
steps are implemented below. Batch/source concurrency protection, project-issued
traverse criteria, complete migration/RLS verification, browser checks and
deployment remain required release work.

## Immutable shot captures and project-connected printable cut sheets

Five capture-route regressions reproduced ignored device time/CRS and the absence
of original-precision evidence. The old numeric coordinate/level columns round
to 0.001 m: an observed RL of 100.0054 is stored as 100.005, which can reverse a
near-limit comparison if an export recalculates from the rounded column.

Forward migration `096_setout_capture_snapshots.sql` adds an immutable JSON
snapshot to each new shot. The application preserves original submitted
measurements, the client's design coordinates, server design coordinates and
revision, device-reported capture time/CRS, the definition/project reference,
vertical datum when declared, reported accuracy, actual criteria and profile
transcription, algorithm identity, and numerical assessment. PostgreSQL checks
snapshot identity and consistency with its existing numeric/result columns.
The existing append-only trigger prevents modification; a new insert without a
snapshot is rejected. Legacy rows remain null and are not backfilled from rounded
values, current definitions, or free-text notes.

The offline queue now sends capture time and CRS as structured fields. Calendar
timestamps need an explicit timezone; invalid or ambiguous values are rejected.
A changed capture CRS blocks a new upload. Snapshot-backed retries compare the
original numbers and capture context, so a 0.01 mm change cannot reuse an accepted
device shot ID. An exact accepted retry can reconcile even after the current
project reference becomes invalid. Older clients that omit capture context keep
their measurements with explicit missing-evidence flags; no time or device CRS
is invented. The snapshot records a device action's reported time, not an
independently verified instrument observation epoch.

CSV export and the field register read snapshot precision when available. The
CSV separates capture CRS, current definition CRS, device capture time and server
recording time. The new private `format=html` export reads saved project shots,
including re-stakes, and groups different revisions/criteria into separate
sections. It uses the shared engineering comparison engine and established print
layout. Original decimal coordinates remain visible, metadata and notes are
escaped, and the canonical `public/metardu-icon.png` is embedded for offline
printing. Coordinate and evidence rows stay together; table headings repeat.
The field page links to both CSV history and a printable draft HTML cut sheet.
The user can open the HTML and print/save it as PDF without a browser/PDF runtime
dependency on the application server.

Legacy observations have a separate NOT ASSESSED appendix. Missing capture
reference/time or required level/datum evidence cannot earn a report PASS. A
horizontal-only target is explicitly scoped as such. Recorded numerical results
are distinct from construction acceptance; default numeric criteria are labeled
as not being issued project requirements, and approval names remain transcriptions, not
verified endorsements. Unsupported or inconsistent snapshots fail closed rather
than silently using rounded legacy columns. Historical criteria are replayed
from their snapshot, independently of current defaults; incompatible numerical
algorithm changes require a versioned replay implementation.

The PostgreSQL verifier applied migration 096 after creating three legacy rows,
then inserted 100 full-precision synthetic captures. It proved that 100.0054
remains in the snapshot while the numeric column contains 100.005 and the result
remains WARN. Missing snapshots and attempted evidence edits are rejected. After
changing the definition CRS, exports still use the original capture CRS and
precision. The generated report retains 99 numerical passes, one warning, and
three unassessed legacy records; it is explicitly synthetic and draft.

Chrome printed the actual stored-record HTML to nine A4 landscape pages.
Visual inspection checked the first page; PDF text extraction verified the
final shot, original RL, device-time label and legacy appendix in the PDF itself.
The canonical logo is present in both the rendered HTML and PDF. Artifacts:
`test-results/design-revisions/synthetic-project-cut-sheet.html`,
`synthetic-project-cut-sheet.pdf`, `print-result.json`, and `pdf-text-result.json`.
Regenerate stored records/HTML with `node scripts/verify-design-revisions.mjs`
against the disposable database; print locally with
`node scripts/verify-project-setout-print.mjs` using installed Chrome.

Migration 096 has not been deployed by this work. Apply it together with the
capture-aware application: the previous application cannot insert new shots
without snapshots, and the new application reads the new column. Release still
requires the complete migration chain/RLS checks, deployed authentication and
browser workflow, physical-device offline/retry testing, and actual instrument/
control evidence. This local database exercise uses minimal prerequisite tables
and does not certify a survey, prove instrument precision, or establish live
production readiness.

Local validation for this capture/report pass: 60 focused tests across seven
suites passed (the final three changed suites were rerun after adding mixed-
criteria and HTML-download coverage). Both app and test TypeScript projects
passed; scoped lint, script syntax, workflow YAML parsing and scoped whitespace
checks passed. The five capture regressions failed before implementation.
Additional cases cover exact accepted retries after an invalid current reference,
sub-millimetre ID-reuse rejection, different stored criteria remaining separate,
HTML escaping/private response headers, and the field-page download link.

## Linux packaging and database release rehearsal

Read-only inspection of the running Docker app found that its database login
`metardu` is a superuser with BYPASSRLS, role creation and database creation.
The running migration ledger has 69 entries and stops at 064. Against the
checkout, 32 later migrations are unrecorded. The existing design/set-out tables
have RLS disabled and observations lack `capture_snapshot`. Container health
does not establish that the current source or isolation protections are live.
Metadata-only evidence is retained in `.cache/release-verify/runtime-metadata.json`.
No customer rows were read for this inspection and the live database was not
modified.

Historical migration 000 was restored to its applied source after verifying
that its only added DDL is already present in forward migration 078. Migration
052 and 064 initially differed from the recorded hashes in both current source
and the running image. The exact applied files have since been recovered from
two older local images, as documented below. The ledger was not overwritten and
no production migration was forced. An existing-customer-data upgrade remains
unverified.

A disposable PostgreSQL 15.4/PostGIS database, matching the running database
image, successfully applied all 101 migration files from empty state and passed
checksum verification. The one-shot role provisioner then reproduced a real
driver bug: PostgreSQL `name[]` role memberships arrive as a string in
node-postgres, causing a valid restricted login to fail verification. The
catalog query now casts member names to `text`, yielding decoded `text[]` while
keeping strict membership checks. The actual provisioner subsequently passed
all 101 migration checks through the restricted runtime login. Eleven verifier
tests passed, including a catalog-only real PostgreSQL regression enabled with
`TEST_RUNTIME_DATABASE_URL`; this integration case is skipped without an
explicit test connection. Fresh installation and role provisioning are proven
locally; an upgrade of the existing database and deployed RLS workflows are not.

Docker build context now excludes preview builds, TypeScript cache files,
local credentials, backups and generated audit artifacts. The app TypeScript
config no longer includes a stale preview's generated route types. Strict app
type-checking passed. Build dependencies use a persistent npm download cache,
five download sockets and an extended fetch timeout after a reproduced registry
read timeout. Placeholder build credentials are scoped to the build command
instead of image arguments/environment. No build or runtime checks were disabled.

The isolated Linux release build uses its own builder, limited to two CPUs and
5 GiB RAM. Dependency installation succeeded on retry; Next completed production
compilation, strict type checks, all 217 static pages and standalone preparation.
The cold Next build took about 30 minutes under those resource limits. Image
`metardu-release-verify:20261008` successfully finished packaging and loaded
locally. The homepage report is 126 kB first
load JS, with 113 kB shared by all routes. A generated 6.02 MB JavaScript chunk
exceeds Workbox's precache limit; inspection identifies WebLLM/TVM code and
embedded WebAssembly. Existing local-AI imports are dynamic, so the warning is
not evidence that the homepage downloads that engine. No cache size limit was
raised. The original app and database containers remain running unchanged.

## Restricted-login fieldbook audit repair

Exercising the complete schema with the real provisioned application role
reproduced a legitimate survey-point update failing: migration 015's invoker
trigger could not insert into the RLS-protected audit table. Its read policy
also checked membership of any project rather than the audit event's project,
and its survey-point predecessor lookup incorrectly queried fieldbook entries.

Forward migration `097_fieldbook_runtime_audit.sql` records event project scope,
deriving historical scope only from a valid UUID already present in its stored
payload. Unscoped history remains unscoped and inaccessible. A trigger with a
fixed search path writes the private sink as its owner; source-row RLS still
authorizes the outer operation and any failure rolls back the audit insert.
The function accepts only the two actual source relations. The application
cannot insert audit events directly, and an append-only trigger rejects event
updates/deletes even through the privileged test connection. Existing event
hashes, payloads and timestamps remain intact; historical broken chains are not
recomputed or represented as repaired evidence.

The full-schema RLS verifier now accepts an explicitly provisioned runtime role,
checks its privilege gate, and tests authorized edits, viewer write denials,
membership removal, private-project audit isolation, team administrator access,
direct audit insertion/mutation denial and retained history after point deletion.
RLS may deny a write with zero affected rows or SQLSTATE 42501; either must leave
no new audit record. Role provisioning works from adjacent scripts in both the
checkout and Docker layout, and CI provisions `ci_app` before its RLS test. The
production role gate also rejects inherited public-table ownership and effective
migration-ledger write permissions.

The audit API uses recorded project scope, retaining deleted rows and other
authorized team actors in project history. It validates project UUIDs and limits
and returns private, uncached responses. Predecessor verification follows links
instead of trusting transaction timestamps to order rows, rejects ambiguous,
missing or disconnected history, and cannot mark an empty/inaccessible history
valid. Its scope is explicitly predecessor links only; it does not authenticate
payloads, digital signatures, measurements or regulatory acceptance. The drawer
no longer displays an unconditional integrity-verified claim.

`node scripts/verify-fieldbook-audit-upgrade.mjs` passed on the fixed disposable
PostGIS database. It installs the original trigger in a rolled-back fixture,
creates original audit payloads, applies the forward repair, and proves legacy
hash/payload preservation, unscoped-history denial, restricted point/fieldbook
edits, predecessor links and deleted-entry history. Transactional unsafe grants
and inherited table ownership are detected by the runtime gate and rolled back.
Evidence: `test-results/runtime-database/audit-upgrade.json`.

The disposable database subsequently passed verification through its restricted
login with all 102 migrations. Thirty-three focused tests across four suites
passed, including the real PostgreSQL array-codec test; strict app/test type
checks, scoped lint, script syntax and CI YAML parsing passed. The first Linux
image build began before this audit repair and is packaging evidence for its
earlier source snapshot; a subsequent image build including the audit changes
has started as `metardu-release-verify:20261008-audit` using the existing builder
and warm caches.
Migration 097 and the latest app code have not been deployed. Existing-customer
data upgrade testing, full application isolation, live OAuth,
physical-device/offline workflows and other release gates remain open.

## Packaged HTTP workflow checks and shared request identity

The audit image completed its Linux build and started as a separate loopback
preview at `127.0.0.1:3002`, using only the disposable database and provisioned
`release_app` login. Its original entrypoint verified all 102 migration checksums
before starting Next. Health, password login for two synthetic accounts, private
project discovery, private audit isolation, session-version revocation and
suspended-account login denial passed through real HTTP requests. OAuth provider
credentials were intentionally not supplied; password checks are not OAuth proof.

`scripts/verify-packaged-app.mjs` reproduced two actual image failures: an active
firm member saw no firm audit events, and PDF text import returned
`DOMMatrix is not defined`. The newer API wrapper did not initialize organization
context; the packaged PDF.js runtime lacked both `@napi-rs/canvas` and its Node
worker. The failing HTTP result remains in
`test-results/runtime-database/packaged-app.json`; it is not a passing release gate.
The original failing result is also preserved as
`packaged-app-before-workflow-repair.json` before any repaired-image rerun.

Both API wrappers now use shared membership resolution and synchronous identity
binding in their own calling context. An initial asynchronous helper returned
the correct organization but did not propagate an `AsyncLocalStorage.enterWith`
change across its caller's await; the real database test caught this and the
caller now binds the resolved organization synchronously. Membership lookup
errors are no longer silently ignored. Removed memberships and inactive firms
do not become default organization context. This preserves the existing default
firm selection convention; explicit multi-firm workspace selection still needs
its own workflow verification.

The actual `src/lib/db.ts` module and shared request helper passed a PostgreSQL
exercise with 20 concurrent identities using one physical connection. Private
projects stayed isolated, idle leases exposed no fixture rows, query errors
cleared context, transaction rollback removed both point and audit event, and
privileged request context did not carry into a subsequent ordinary request.
Active-firm resolution, removed membership and inactive-firm cases also passed.
Evidence: `test-results/runtime-database/pool-isolation.json`. Pool and legacy
audit checks are wired into the existing CI E2E database jobs, with separate
bootstrap/runtime roles and uploaded JSON artifacts. Mutating test scripts accept
only explicit loopback connections to allowlisted disposable database names;
they never fall back to deployment environment credentials. Nine boundary tests
passed for that configuration guard.

Standalone preparation now copies PDF.js's installed native canvas package and
only the actually loaded platform binary, failing preparation if its required
constructors/binding are unavailable. The parser route also explicitly traces
`legacy/build/pdf.worker.mjs` alongside its standard fonts. A new isolated build,
`metardu-release-verify:20261008-workflows`, includes these two workflow repairs.
Its packaged HTTP rerun passed firm audit access. Native PDF initialization then
succeeded, but exposed a second failure: Webpack's dynamic Node module namespace
did not expose the named `createRequire` import (`f is not a function`). The
parser now obtains `createRequire` from the module's default export. A harness
bundling the actual parser with Next's vendored Webpack passed PDF text extraction
and retained `100.0054` precision without inventing CAD geometry. That harness
is wired into CI; it is not a substitute for the packaged HTTP rerun.

Broader API verification passed all 144 tests across 22 suites. Two scheme-test
factories were updated to provide organization setters, logger methods and an
empty membership result; their existing validation/CRUD assertions were retained.
Strict app/test TypeScript checks passed. Browser inspection confirmed the
packaged homepage and navigation/login page render, but the login page still
displayed unverified compliance, universal offline and adoption claims. Those
three badges were replaced in source with capability descriptions. The parser
and copy changes passed compilation, strict type checks, all 217 generated pages
and standalone preparation, but Docker then timed out exporting the image.
The subsequent recovered-migrations image built and loaded successfully as
`metardu-release-verify:20261008-recovered`, image SHA-256
`e9e0a9f91a31d75faa7acc014c22520a3e3b93dca980a8a4b3ffd5a4c4f84efe`.
Its isolated preview passed all 13 checks in `scripts/verify-packaged-app.mjs`,
including PDF text import, firm audit access, password sign-in, private project
and audit isolation, session-version revocation and suspended-account sign-in
denial. This does not prove revocation of an already-active session by account
suspension; that separate scenario still needs repair/verification. The previous
PDF failure is retained as `packaged-app-before-parser-repair.json` and the passing
result is `packaged-app.json`. Browser reload confirmed the three capability
descriptions and the logo on `/login`. No Google/OpenAI OAuth provider credentials
were supplied, so these results are not deployed provider-login or ChatGPT proof.
No deployed site, customer records or production credentials were changed.

## Original migration recovery and existing-schema upgrade rehearsal

Both `metardu-metardu-app:sept21-documents-repaired` and
`metardu-metardu-app:sept21-map-verified-base` independently contained the exact
original migration files. They were inspected with networking disabled and
their default entrypoints bypassed; no old application or migration runner was
started. Recovered hashes:

| Migration | Recorded and recovered SHA-256 |
| --- | --- |
| 052 | `1b7bcc2e314ee10efa4bdf324738c49b7c05311932e86ed9a566167e1a5756fc` |
| 064 | `152e67e043cfad39c2267c7a695933559d5e3ac26089eb0498a084b3723892e7` |

Each differs from the current file only by one CRLF amid LF line endings; there
is no SQL behavior change. Source files were restored byte-for-byte, previous
copies were preserved in the ignored verification cache, and exact Git attribute
exceptions prevent future normalization. Tests pin both original hashes. Against
the metadata captured from the running database, all 69 applied entries now
match, with 33 pending migrations, zero mutated files and zero ghost entries.
Evidence: `.cache/release-verify/migration-recovery.json` and
`runtime-drift-after-recovery.json`.

A new disposable database restored the original schema dump and all 69 recorded
ledger version/checksum pairs. The ordinary migration runner applied all 33
pending migrations successfully without `--force` or historical checksum edits.
The role provisioner then verified all 102 migrations through a new restricted
`release_upgrade_app` login. The organization RLS verifier passed role checks,
membership downgrade/removal, child-row protection, private audit isolation,
deletion history and immutable project scope on that upgraded schema. Fixture
writes were rolled back. Evidence: `recovered-schema-upgrade.log`,
`recovered-schema-provision.log` and `recovered-schema-rls.log` in the ignored
verification cache. This proves the existing-schema path with synthetic records;
it does not prove transformations of existing customer records.

The 13 migration-verifier tests passed, including both recovered byte hashes and
the PostgreSQL membership-array catalog check against the upgraded restricted
login. The test TypeScript project, scoped test lint and scoped whitespace checks
also passed. Metadata-only summary: `recovered-schema-upgrade.json`.

Read-only Oracle discovery through the currently configured account found only
the Johannesburg subscription and no retained METARDU instance in its accessible
compartments. This does not establish the status of other accounts or deleted VM
volumes. No Oracle resources were created, started or modified.

Automatic approval review rejected copying the live database payload into a
persistent disposable database because that sensitive-data copy lacked explicit
authorization. Approval was requested for an isolated local rehearsal followed
by deletion of that copy. The copy has not been made; production remains unchanged.

## Account suspension and atomic administration

An additional packaged check exposed that suspending an account did not revoke
its already-active website session. The JWT callback now checks current account
suspension as well as the session version. ChatGPT consent, authorization-code
exchange, refresh and bearer authentication also refuse suspended accounts.
Migration 098 increments the session version and revokes existing ChatGPT grants
on suspension, including a backfill for already-suspended profiles. Restoring an
account does not revive old credentials; a fresh sign-in or connection is required.
Consent locks the user before reading suspension in a separate statement, so a
concurrent suspension cannot leave a usable new grant behind.

The packaged administration check also exposed a partial commit: changing a
profile could succeed before audit logging failed. Suspension/restoration and
their audit event now share one database transaction. Global account changes
require a platform administrator; firm administrators cannot globally suspend or
restore accounts. Migration 099 allows authenticated users to append audit events
only with their own actor identity. It does not allow historical audit mutation.

`scripts/verify-account-suspension.mjs` passed 20 checks against the actual source
authentication modules and restricted PostgreSQL pool, using disposable synthetic
accounts. These include concurrent consent/suspension, existing and fresh website
sessions, outstanding codes, bearer/refresh tokens, legacy unrevoked grants,
restoration, actor forgery rejection and audit-failure rollback. Evidence:
`test-results/runtime-database/account-suspension.json`.

The focused authentication/ChatGPT suite passed 91 tests across nine suites,
including six real PostgreSQL/MCP protocol integration cases. Those integration
tests now use only the guarded disposable database configuration and native Node
HTTP headers; they cannot fall back to deployment credentials. Strict app and
test TypeScript checks and scoped lint passed. The restricted-pool isolation and
fieldbook-upgrade verifiers passed again. These database checks and the ChatGPT
integration suite are included in CI; the workflow YAML and new verification
scripts passed syntax checks.

The original-schema rehearsal was advanced from 102 to all 104 migrations with
the ordinary runner. Restricted-role verification and organization/project RLS
checks passed again, with synthetic fixtures rolled back. Relative to the original
69-entry ledger, the source now contains 35 pending migrations. This remains a
schema-and-synthetic-data rehearsal, not a rehearsal of customer record contents.

The interim suspension image build was stopped after the partial-commit bug was
identified, and replaced by `metardu-release-verify:20261008-account-audit` with
both repairs. That first attempt compiled successfully but was killed during type
checking; the builder's cgroup counters confirmed an OOM kill at its five-GiB
limit. The retry retains build caches, restores the two-core CPU quota, raises
only the isolated builder's memory limit to six GiB, and temporarily stops the old
disposable preview to free memory. The running production services were not
reconfigured. The retry passed compilation, strict types, all 217 pages and
standalone preparation, but its Docker import session expired. A fresh build
session then built and loaded the image successfully.

`scripts/verify-packaged-mcp.mjs` additionally checks the packaged token and MCP
routes with synthetic authorization-code fixtures, covering PKCE, private project
isolation, tool metadata, scope challenges, refresh rotation and suspension. It
requires the isolated preview's integration origin to be `https://metardu.example`.
It does not contact that domain or prove browser consent or a live ChatGPT connection.
Syntax verification and all 14 HTTP checks passed against the new preview. They
also exercise deterministic stakeout and level-book outputs with a separate
calculation-only grant; that grant cannot discover private projects.

The drainage/design/set-out regression suite also passed 63 tests across seven
suites, covering drainage calculations, atomic design saves, capture integrity,
exports and RLS migration contracts. These remain automated checks; instrument,
field and deployed workflow validation are separate requirements.

The loaded image is `metardu-release-verify:20261008-account-audit`, Docker image
ID `sha256:b7d390a99631b66f27f61856b9028713d30dddd641322d4df72f3caa77766dd4`.
A one-shot, read-only, network-disabled inspection confirmed 104 migrations and
both recovered historical byte hashes. Its isolated preview has no mounted
customer data, listens only on loopback port 3002, and verified all 104 migrations
through the restricted login before starting Next.js.

All 23 packaged application HTTP checks passed, including real password login,
private project/audit isolation, PDF text import, firm audit access, existing
session revocation, platform-versus-firm administration, account restoration and
atomic rollback when an audit append is deliberately denied. The first injected
audit-failure fixture compared a text `record_id` to a UUID, causing a SQL type
error before the intended denial. Its result is preserved as
`packaged-app-before-audit-fixture-repair.json`; the fixture now compares text and
the passing check requires the expected permission-denial response, unchanged
profile/session version, and continued access by the existing session.

The 14 packaged MCP checks passed PKCE rejection without code consumption,
valid exchange, seven-tool metadata, account isolation, observation-scope
challenges, identity-injection rejection, refresh rotation, suspension and
non-revival on restoration. A synthetic east target returned 100 metres, grid
bearing 90 degrees and clockwise turn 90 degrees. A synthetic level run returned
closing RL 101 metres and zero misclosure, with unspecified acceptance remaining
unknown. Evidence: `test-results/runtime-database/packaged-app.json` and
`packaged-mcp.json`. Synthetic fixture records were removed afterward.

Browser reload of the new image confirmed the company logo, login form and the
three capability descriptions. Source checks also confirmed the current CI YAML
and verification-script syntax; scoped whitespace checks passed. Current schema
evidence is `.cache/release-verify/account-audit-schema-upgrade.json`.

Both attempts' Next build traces are preserved in the ignored verification cache.
The successful trace records about 667 seconds for Next's build, including about
242 seconds checking TypeScript, 207 seconds tracing server files and 173 seconds
compiling Webpack. Those nested durations can overlap and must not be added. The
earlier Docker wall-time report differs substantially from its internal Next
trace; that discrepancy does not prove that page computation itself consumed the
entire pause. No claim of a build-speed improvement is based on that comparison.

This verifies local Linux packaging and synthetic HTTP workflows. Deployed HTTPS
provider callbacks, real ChatGPT browser consent, public-directory approval,
customer-record upgrade rehearsal, physical instruments and field acceptance
remain unverified. Production services and customer records remain unchanged.

## Packaged drainage workflow: request-body and query-context blockers

`scripts/verify-drainage-http.mjs` exercises real password sign-in, project
creation, reference-system declaration, engineering-data saving, target
generation, shot capture/retry, revision changes and private CSV/HTML exports.
It uses a newly created, explicitly marked `metardu_runtime_verify` database
with all 104 migrations and a restricted `release_drainage_app` login. No
customer payload was copied. Its preview listens only on loopback port 3003.
The append-only evidence triggers remain enabled; the disposable database will
be discarded as a whole after its preview stops.

The first real request to the set-out route returned `action is required` for
valid JSON. `apiHandler` had already consumed the stream before the route tried
to parse it again. The route now reads `ctx.body`. Updating the route-test
wrappers to consume the stream first reproduced seven failures against the old
implementation; the repaired route passed them. The shared-handler contract test
also verifies that POST handlers receive parsed JSON after stream consumption.
Evidence: `test-results/drainage-http/before-request-body-repair.json`.

The body repair built and loaded as `metardu-release-verify:20261008-drainage-body`,
image ID `sha256:efdba6c841334c039b563280986d3bce9c1f4e02dce3a0830f69b17bd484f7cb`.
Its HTTP rerun passed project creation, rejection of an undeclared CRS, and
declaration of the horizontal/vertical reference, then exposed a second blocker:
`/api/db` constructed a query builder around the raw pool. No per-lease request
identity was applied, so the restricted login returned no updated project row.
The engineering save guard correctly refused to call that a successful save.
Evidence: `test-results/drainage-http/before-query-context-repair.json`.

The query builder now accepts a typed query executor. The browser proxy supplies
the existing context-aware `db.query` helper, resolves the signed-in user's
organization and clears inherited service/Till privileges. The server client
captures its provider session and executes queries in an isolated async scope,
so it does not depend on the caller's current identity or overwrite that caller.
Anonymous access clears the user identity explicitly; private rows remain hidden.
The proxy's ownership filters, conflict guards and the engineering save's
one-returned-row requirement are retained.

`scripts/verify-query-context.mjs` passed ten checks with real restricted
PostgreSQL queries and the actual proxy/server-client/query-builder modules.
Only provider-session lookup is replaced by synthetic sessions. Twenty
concurrent client requests used their captured identities even under callers
carrying platform-admin context. Owned updates succeeded, foreign updates did
not change data, anonymous clients saw no private rows, caller context was
preserved and pooled leases were cleared. Result:
`test-results/runtime-database/query-context.json`. It is included in the CI
runtime-database job. The original pool-isolation verifier passed again using
one physical connection across twenty identities.

The combined focused suite passed 74 tests across seven suites. Strict app/test
TypeScript checks and scoped lint passed after the query-context repair; CI YAML,
script syntax and scoped whitespace checks passed. The Linux image
`metardu-release-verify:20261008-query-context` built and loaded successfully as
image ID `sha256:af2c2ab3d76ed3674ed165785c463e2d0605e696e7cf0e1d0d7e8e4842e2127c`.
Its real password-session drainage rerun passed all 26 workflow checks. The PDF helper renders
only the exported local document and checks A4 landscape pages, embedded logo,
original precision and failed/unassessed observations; it does not access a
website, provider account or customer data.

The successful workflow created a project and explicit reference through HTTP,
saved engineering inputs through the browser proxy, generated three expected
invert targets, and stored three shots (one numerical pass, one fail, one missing
observed level). Original `100.0054` RL and five-decimal coordinate precision,
capture time, datum and revision were retained. Replays did not duplicate data;
altered replays and mismatched CRS were rejected. Private CSV/HTML exports retained
failed and unassessed observations. Regeneration appended revision 2 without
deleting old targets or shots, rejected a new stale-revision delivery, reconciled
the original accepted delivery, and kept revision 1 exportable.

The actual exported HTML printed to a one-page A4 landscape PDF with the embedded
canonical logo. The packaged native parser extracted its precise RL and synthetic
notice, returning no inferred CAD/building geometry. Its font-spacing output uses
multiple spaces between words; the prose-marker check was corrected to accept
whitespace, while numeric matching remains exact. Artifacts are in
`test-results/drainage-http/`, including `result.json`, HTML, CSV, PDF, PNG,
`print-result.json` and `pdf-parser-result.json`. Synthetic accounts were suspended
after each run. The marked synthetic-only drainage database was subsequently
dropped after confirming its purpose marker and zero active connections; exported
evidence remains in the workspace.

PDF inspection also revealed delta digits splitting across narrow cells (`+0.003 2`
instead of an uninterrupted `+0.0032`). The shared report's numeric cells now use
`white-space: nowrap` and normal overflow wrapping; calculations and stored
precision are unchanged. Thirty report/export tests passed. The strengthened
PDF check requires uninterrupted `+0.0032` and `+0.0054` strings. The image
`metardu-release-verify:20261008-print-readability` built and loaded successfully.
All 26 strengthened packaged HTTP checks passed, including uninterrupted numeric
strings from the real PDF parser. The final PNG was visually inspected: the table
remains within the page and keeps failed and unassessed shots visible.

Test-only files and verification scripts are excluded from Docker's build
context, with `verify-migrations.mjs` explicitly retained for runtime startup.
The strict app build is unchanged. This prevents test-only edits invalidating
the application image; it does not establish faster compilation of app changes.

An AST scan found eleven other direct `apiHandler` consumers that re-read JSON
without `rawBody:true`. They remain separate source findings in
`.cache/release-verify/consumed-json-route-audit.json`; their complete runtime
workflows have not been tested here. Inspection also found the surfaces route
forming `EPSG:<utm_zone>` instead of resolving the saved CRS, and community
routes exposing seeded or in-memory records. Fixing those requires their actual
geometry/persistence paths, not merely making their body parsing appear to work.
The surfaces finding has now been repaired and exercised as described below;
the other ten consumed-body findings remain open.
The full platform is not production-ready on the strength of these focused tests.

## Complete terrain constraints and project surface evidence

The old breakline TIN removed crossing triangles without filling the resulting
holes or including new breakline endpoints. Its alternate refinement helper used
approximate fan filling. The established browser contour engine also had its own
partial triangle-splitting implementation. All three now delegate to a shared
constrained triangulation kernel (`cdt2d@1.0.0`, with directly declared
`robust-orientation@1.2.1` predicates). Plain unconstrained observations retain
the Delaunator path without unnecessary constrained retriangulation.

Every supplied XYZ vertex is included; exact duplicate coordinates with
contradictory heights fail closed. Existing measured vertices split constraint
edges. Consistent crossing lines acquire a height-controlled intersection;
contradictory crossing heights, residual crossings/junctions, omitted vertices,
missing constraint edges and inconsistent observation-hull coverage are rejected.
Limits are 10,000 combined vertices and 2,000 split constraint segments. These
are numerical safeguards, not evidence that a field survey is accurate.

Contours now trace piecewise-linear elevations on that mesh, with shared edge
keys for connectivity, explicit endpoints/branches and closed cycles. Flat
plateaus do not produce artificial contour polygons, and an interpolation-grid
boundary is not mistaken for an isoline. Limits of 500 levels, 2,000,000
triangle/level pairs and 200,000 output vertices bound synchronous work. The
retained `resolution`/`gridResolution` request values control maximum contour
vertex spacing; the project page labels that meaning. The drawing composer uses
this same engine and shows computation failures instead of silently exporting
without its failed contours. Ad-hoc slope diagnostics use actual facet gradients,
not distances between vertices on the same constant-height contour.

The project surfaces route consumes validated `ctx.body`, requires an explicit
saved projected CRS (legacy defaults do not qualify), and never substitutes zero
for missing breakline heights. Read access uses the shared access check; writes
require the owner. Contour retrieval joins the revision back to the requested
project, including when the same user owns both projects. Responses are private
and `no-store`.

Computation and persistence share a transaction with a project row lock and
locked observations, reference and stored breaklines. The shared transaction
helper releases its pool lease. Concurrent recomputes append distinct successive
revisions. Each revision records full observation IDs/XYZ, supplied breaklines,
reference declaration, parameters and mesh; SHA-256 covers that complete snapshot
instead of point/line counts. Failed inputs roll back without partial geometry.
Existing immutable revisions remain unchanged, including historical outputs from
the old algorithm; corrected geometry requires a new computation.

Jest's top-level Delaunator manual mock previously substituted an angle-sorted
fan, which omitted ground area for a square plus its centre point. It is now an
inactive legacy fixture, and the real ESM package and predicates are transformed
for Jest. The focused geometry, worker, corridor and persistence suite passed
112 tests across ten suites. App/test strict TypeScript checks and scoped lint
passed. CI YAML parsed, and the native surface verifier is included in CI.

`scripts/verify-surface-runtime.mjs` passed 15 checks on actual PostgreSQL under
the restricted runtime login. Only provider session lookup is substituted with
isolated synthetic sessions; the routes, shared API handler, JSON consumption,
engines, access checks, transactions and RLS are real. Evidence covers ridge
geometry, stored/reloaded snapshots, same-owner cross-project lookup rejection,
foreign writes, missing-height rejection, changed-XYZ hashes, concurrent revision
serialization, density limits and unchanged original history. Its accounts are
suspended afterward; immutable synthetic revisions are retained as evidence.
Results are in `test-results/runtime-database/surface-runtime.json`.

The isolated Linux image `metardu-release-verify:20261008-constrained-terrain`
is being built with the tested two-core/six-GiB builder limit. Native source
checks do not establish a successful Linux package or deployed HTTP behavior.
`scripts/verify-surface-http.mjs` is prepared to exercise the resulting package
with real synthetic password sessions. Live provider OAuth, customer-data upgrade
rehearsal, deployed survey outputs and real instrument observations remain
separate, unverified gates.

## Remove font downloads from build and page delivery

The first terrain image attempt failed after compilation with
`Failed to fetch Newsreader from Google Fonts`; the installed dependency stage
had completed successfully. This was an external font download failure, not a
terrain type error. The root layout previously fetched three families through
`next/font/google` during builds and fetched Geist through a Google stylesheet
during browser navigation.

Instrument Serif, JetBrains Mono and Newsreader's exact public WOFF2 binaries,
styles, Unicode subsets and fallback metrics were recovered from the successful
print-readability image. Geist's existing stylesheet weights were downloaded
once into fingerprinted local files. All four official SIL Open Font License
notices are retained. `public/fonts/README.md` records the sources, and its
manifest pins the bytes and full SHA-256 of all 18 binaries (316,068 bytes across
all subsets). The browser requests only the fonts/subsets used by its content.

The root layout imports local font faces, preserves its CSS font variables and
preloads only the shared Latin body font. Fingerprinted WOFF2 paths receive
public one-year immutable caching; licenses and other unversioned files do not
match that rule. Asset hashes, local CSS references, absence of remote font URLs,
all 18 header matches and license-path exclusion were checked. Strict app
TypeScript and root-layout lint passed. The Linux build is being retried with
its installed dependency layer reused; successful delivery of the resulting
image has not yet been established. The retry compiled successfully in 7.2
minutes, then was killed for memory exhaustion during strict type validation;
the build did not produce a runtime image. The builder's cgroup recorded an
additional OOM kill. Local strict app/test checks still passed.

Next's installed configuration documents that a custom Webpack configuration
disables its build worker unless explicitly enabled. The project now enables
that separate compilation process and Webpack memory optimizations, limits
static workers to two CPUs, and keeps parallel server compilation/tracing off.
The compilation process can exit before mandatory type validation, avoiding its
retained heap competing with the type checker. `ignoreBuildErrors:false` is
unchanged. Another isolated build is running to test this change; no memory or
speed improvement is claimed before that build completes.

## Preserve contour geometry through CAD drawing export

The drawing composer formerly clamped contour vertices to the drawing frame,
closed every contour, emitted disconnected zero-elevation DXF lines, and cached
previously visited layers without restoring the actual active layer. Those
behaviors changed survey geometry and misplaced entities on alternating layers.
The shared drawing model now retains original XY coordinates, includes contour
extents in its frame, detects closure only from equal endpoints, and carries the
contour elevation. DXF export uses connected LWPOLYLINE entities, correctly resets
the active layer, and adds each contour's group-38 elevation through the writer's
native shape tag interface. See the [Autodesk LWPOLYLINE specification](https://help.autodesk.com/cloudhelp/2017/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm).

The real application DXF importer round-trips measured XY and RL, open/closed
topology, metre units and alternating layer assignments. Ten drawing/importer/
parser tests passed, and strict app/test checks passed after the export repair.
An initial fixture omitted the required feature code and was corrected to a
coded spot-height observation; the original layer-switch failure was independently
reproduced and fixed. CAD-application opening and issued-document approval remain
unverified. The export repair is included in the current image build attempt.

## Packaged terrain verification and operation quota correction

The build-worker retry completed strict checking, generated all 217 pages,
created the standalone runtime and loaded
`metardu-release-verify:20261008-constrained-terrain` as
`sha256:20b8a37628b422575bed3ccc6a8b6a9844c788c4f8b1862f5a4bc555696cf2eb`.
The cold compile reported 7.9 minutes; type validation took about 12.7 minutes
under the two-core/six-GiB builder limit. This established a working build, not
a general speed improvement. PWA generation was disabled for this verification
image, as in earlier isolated package checks.

The localhost-only preview on port 3004 started healthy with no filesystem
mounts. Actual password-session HTTP checks passed for sign-in, all 18 font
asset hashes and immutable caching, a landing page without Google Fonts links,
project creation, CRS refusal/declaration and four point entries. A browser
inspection confirmed the expected landing typography, photographs and navbar.
The first surface computation then returned 429: the shared `apiHandler` limiter
keyed every route by IP alone. Point-entry traffic had consumed the unrelated,
tighter five-request surface budget. The failed result is retained at
`test-results/terrain-http/before-operation-rate-scope.json`; no successful
packaged surface workflow is claimed for that image.

The handler now derives a stable operation key from HTTP method, route template
and the existing client identity. Framework dynamic parameters, UUIDs and CUIDs
are normalized, and catch-all parameters collapse as one route segment. Query
strings, changed resource IDs and percent-encoded identifiers do not create new
operation budgets. Static long route names remain distinct. Limits are still
enforced, and middleware and login protection remain in place.

A meaningful regression test first reproduced the false 429 with the real
in-process limiter; after the repair, point entry does not consume compute
quota and repeated computes still return 429. The focused handler/security/
CPD/scheme/overlap suite passed 52 tests in eight suites. Strict app/test checks
and scoped lint passed. Existing quota mocks were updated for the new helper;
the quota regression itself uses the actual implementation.

The actual restricted-PostgreSQL source verifier now passes 16 checks including
saved-contour DXF export/re-import with exact XY, RL, layers and closure. Its
synthetic DXF is `test-results/terrain-source/synthetic-contours.dxf`. The query
context regression still passes all ten checks, including twenty concurrent
captured identities. The combined terrain/drawing suite passed 122 tests in
thirteen suites.

The corrected image `metardu-release-verify:20261008-terrain-rate-scope` is being
built separately. The earlier preview was stopped to free build memory. Customer
services and records have not been replaced or upgraded by these tests.

The Windows incremental app diagnostic reports 5,711 input files, about 449,000
TypeScript lines, 454,000 declaration lines and 182,000 JSON lines. The cache
graph has 1,966 source inputs (22.1 MB), 3,742 dependency inputs (22.8 MB), and
three generated inputs. Its largest application input is the 3.48 MB canonical
`data/cassini/merged_subsheets.json`; large icon, DOM, CSS, Redis and browser
protocol declarations also contribute. The warm run parsed/bound the graph in
46.28 seconds using about 1.19 GiB; zero new type instantiations indicate reused
diagnostics, so this is not a cold full-check benchmark. The graph report is
`test-results/runtime-database/compilation-graph.json`. Canonical survey data and
strict checks were preserved, and existing CI caches include both TypeScript
build-info files and Next's cache.

## Final packaged terrain result

The corrected image built and loaded successfully as
`sha256:c85dd638ad37b61966b6ac4ae56bec273c0a2bf7b65813f0c391be1868a73aba`.
The cached compile reported 2.9 minutes, type checking completed in about 3.2
minutes, and the full Next build completed in about ten minutes before image
export. Cache reuse and the smaller source change make this a different workload
from the cold build, not a controlled performance comparison. Builder OOM
counters remained at three events/two kills: neither successful worker build
added a kill. Full strict type validation remained enabled.

`metardu-terrain-rate-preview-20261008` runs only on `127.0.0.1:3004`, with one
CPU, one-GiB memory, no filesystem mounts and the restricted synthetic rehearsal
database login. All 15 real packaged HTTP checks passed, including password
sessions, all font hashes/cache headers, no remote font links, saved declarations
and observations, both ridge isolines, complete immutable mesh evidence, private
reloads, foreign-write denial, missing-height rejection and appended revision 2.
The authenticated topo page responded successfully and included the updated
spacing control. This HTTP/SSR check does not independently prove its interactive
client rendering or real instrument behavior. Its test accounts were suspended
afterward. Evidence is `test-results/terrain-http/result.json`.

The public landing page was reloaded and inspected in the browser after the
corrected package started. Its navbar, real reference photograph, local typefaces
and layout rendered as expected. The old customer application and worker remain
running; the customer database and migration ledger were not modified. Deployed
HTTPS provider OAuth, public ChatGPT listing and a customer-record upgrade
rehearsal are still unverified. Ten other consumed-body route findings and the
community persistence/seed findings remain open; the overall production goal
is not complete.

## QA recording and spatial-check integrity

The project QA POST route was another confirmed consumed-body failure. It now
uses the wrapper's parsed body and validates bounded, finite evidence. A manual
PASS/FAIL needs an input revision, measured quantity, threshold, unit, and an
explicit comparison rule; contradictory verdicts and client-supplied automated
triggers are rejected. Full submitted snapshots receive a complete SHA-256
revision encoded in the existing 60-character database field. The first result
retains the snapshot; every result identifies its input revision and
`client_reported`, `certified: false` evidence source. Such checks explicitly use
no stored tolerance profile. They do not verify that client inputs match the
stored field observations or establish legal certification.

The shared QA writer now commits the run, all results and its summary in one
transaction. User-reported recording rechecks the claimed project owner under
a share lock inside that transaction. An injected real PostgreSQL failure on
the second result rolled back the run and first result together. The restricted
synthetic database verifier passed all 13 checks, including authentication,
foreign-account denial, persisted measurements/snapshots, private reloads,
revision changes, missing-threshold rejection and rollback. Its provider session
alone is substituted; PostgreSQL, central request handling and provenance
writes are real. Evidence: `test-results/runtime-database/qa-runtime.json`.

The dashboard no longer marks uninspected documents or registry readiness as
passed. It shows missing inputs as pending, compares absolute angular error,
retains numeric thresholds, fingerprints complete inputs rather than verdict
counts, and exposes failed evidence saves with a retry. The project workspace
passes its saved declaration into QA; missing or legacy references do not
silently choose a grid.

The topology engine now requires an explicit projected metre CRS. Both UI
consumers pass the chosen reference, and map view coordinates are transformed
through the shared CRS authority before entering survey checks. The map
guardrail previously passed display coordinates as if they were survey grid
coordinates. A missing reference, unsupported boundary, invalid coordinate or
geometry-engine failure can no longer produce a clear result. Stale asynchronous
checks cannot overwrite new geometry results, and the guardrail no longer
claims registry acceptance. Turf's buffer and area checks remain advisory;
these changes are not independent proof of jurisdictional conformity or a
replacement for plan review.

Forty-two focused tests passed across six suites, including actual map/grid
coordinate transformations, manual evidence validation, dashboard retries,
negative angular errors, geometry failure handling, stale-result cancellation
and existing design-save atomicity. The separate real Turf integration suite
and provenance contracts also passed. Full application and test TypeScript
checks and scoped lint passed after the source changes. CI now runs the native
QA database verifier. No customer records, customer migration history or live
provider credentials were used or changed.

These QA changes have source and restricted-database verification. The running
terrain preview at port 3004 still uses the earlier terrain image and does not
yet contain them. The isolated bundle analyzer build is in progress; it is not
yet a completed module-size report or a packaged QA HTTP/browser check. Nine
other consumed-body route findings and the community seed/persistence findings
remain open. Overall production readiness is still unproven.

The full analyzer diagnostic subsequently failed at 724.9 seconds with a
SIGKILL and `cannot allocate memory`. The isolated builder's memory counters
advanced from three OOM events/two kills to seven events/three kills. Its server
JSON report was logged as written, but the failed stage did not export a
completed report. This is not a successful analyzer or release build.

A client-only diagnostic has been started with `ANALYZE_TARGET=client` in the
same constrained builder. Server report parsing is skipped, while all server
and client application bundles and full strict application validation remain
required. The optional Docker `build-analysis` target exports diagnostic reports
without adding them to public assets. Default production builds keep analysis
disabled. The retry now includes the final guardrail copy review; its result
must be checked before claiming an analyzer report or Linux build success.

## Completed client analyzer and beacon evidence writer

The client-only diagnostic completed successfully: full strict type validation,
217 generated pages, a 978.6-second Next stage, and an exported 2,053,225-byte
`client.json`. No additional OOM kill occurred (counters stayed at seven
events/three kills). This is a completed diagnostic build, not a deployment or
packaged verification of the later beacon/Cassini changes. PWA remained disabled.
The normalized module report is
`test-results/runtime-database/client-bundle-analysis.json`.

Its largest emitted client assets include WebLLM (6,020,378 parsed bytes),
Cassini corner data (2,057,034), PDF.js (403,068), and several Three.js/Turf
chunks. Emitted sizes alone do not establish route-initial dependency graphs.
The WebLLM callers use dynamic imports for offline use, and the detailed
Cassini tool loads its engine on demand. Those source paths support further
investigation; they are not browser/network proof of every lazy-loading path.

Beacon re-establishment now uses consumed JSON correctly and commits the
replacement, full immutable observation capture and predecessor link in one
transaction. It rechecks creator/project ownership under locks, records ties,
instrument and observation time, requires explicit original/new reference
declarations, and preserves zero or unobserved height correctly. A request UUID
supports exact replay; changed evidence and competing replacements conflict.
The local replacement number does not claim official designation. Unknown
coordinate uncertainty remains null; adoption and verification are not invented.

Forward migration `100_beacon_reestablishment_evidence.sql` adds the missing
project/reference columns, private immutable captures and protection for the
published record. The old route referred to a project column absent from the
schema, reused a UUID as text, and never released its pooled connection. The
old supersession trigger protected only easting. Actual native tests now prove
northing/height protection, deletion rejection, snapshot persistence, rollback,
foreign-user denial, exact replay and one successor under concurrent requests.
All 26 native checks passed with only the provider session substituted. CI runs
the verifier; evidence is
`test-results/runtime-database/beacon-reestablishment.json`.

The new 105-migration schema was provisioned only in the marked synthetic
`metardu_runtime_verify` database under `release_beacon_app`. The separate
104-migration terrain rehearsal, old customer database, customer application and
worker were not upgraded or changed. The registry UI, proximity caches,
superseded-record readers/adoption and full global CRS support remain open.
See `docs/beacon-reestablishment.md` for the source API contract and boundaries.

## Cassini type graph and inverse calculation

The typed CommonJS data boundary preserves the exact canonical JSON, including
its SHA-256 `ae5bf4ddf022b220068f1ca2b249a6ce1f28391e6ee72591eba91f88334b48bf`,
226 sheets, 5,626 sub-sheets and 22,503 corners. It replaces an existing unchecked
cast with a compact declared data shape; calculation code remains in the shared
engineering engine. Full strict compilation remains required.

Two cold TypeScript runs with separate build-info files reported 2,230,818 KiB
before and 2,010,452 KiB after: approximately 215 MiB (9.9%) less reported memory.
Parsed JSON lines fell from 181,767 to 35,043 and inferred types from 809,260 to
698,095. Times were 100.81 and 103.31 seconds; the latter briefly overlapped Jest.
This does not prove a speed improvement or reduce the runtime dataset/bundle.
Existing incremental caches were retained. Evidence:
`test-results/runtime-database/cassini-data-boundary.json`.

The previously skipped Cassini inverse test exposed a sign error and ignored
polynomial terms. The inverse now solves the selected model, retains signed
northing and removes conformal correction with a bounded iterative solve.
Singular/non-finite/incomplete models fail instead of manufacturing zero
coordinates. The control round-trip test is active with a 0.06-foot tolerance
matching output quantization. Additional signed polynomial fixtures pass.
These tests establish numerical reversibility, not independent datum accuracy;
the existing published-control KAT still uses a coarse 100-metre tolerance and
requires reconciliation before survey-grade accuracy can be claimed.

The converter UI rejects blank custom parameters, exposes calculation errors,
clears obsolete results on input/model changes, discards edited inputs during
lazy loads, and applies the selected affine model consistently to batch and
single conversions. Unavailable sub-sheets no longer silently fall back in a
batch. Forty-four tests passed across four suites with no skipped inverse test.
Current source checks do not yet prove packaged/browser delivery of these
changes. Eight other consumed-body findings and community fabricated seed/
persistence findings remain open. The full production objective remains active.

Final source application/test type checks and scoped lint passed after these
changes. A fresh isolated Linux image build was then started as
`metardu-release-verify:20261008-beacon-cassini` (PWA disabled). Its dependency
layers reused cache and it reached production compilation. The image has not
yet completed, loaded or passed packaged HTTP/browser checks at that checkpoint;
the earlier completed client analyzer does not cover this later source snapshot.

## Packaged core verification and latest registry source

The core image completed and loaded as
`sha256:02e472b58babbe7e129f83a2fcfb50efe39f83ab1869a411c53893e1aa43c199`.
The loopback-only port 3005 preview passed 12 HTTP checks with two real synthetic
password sessions. Actual project/reference writes, replacement observations,
zero height, immutable-history reload, exact replay, conflicting evidence,
foreign-session rejection, private cache headers and reported QA persistence
were exercised. Provider OAuth was not exercised. Evidence:
`test-results/beacon-cassini-http/result.json`.

The packaged Cassini page also completed a browser calculation with signed
synthetic custom parameters: 12,345.6 and -65,432.1 feet converted to 503,684.421
and 9,780,041.481 metres and returned to the original displayed values. The
screenshot is `test-results/cassini-browser/synthetic-inverse.jpg`. This proves
the packaged numerical path for that model, not independent geodetic accuracy.

Later source changes repair the registry reader and registration forms. Search
now filters declared CRS, supersession and exact distance before its limit;
rounded/stale proximity caching was removed from this endpoint. The response
shape matches the panel, zero heights are shown, unknown grids cannot be copied
as trusted coordinates, and unrelated creators' project identifiers are
redacted. Owned project choices are private, minimal and paginated. Registration
requires a saved project reference, preserves unknown uncertainty, and commits a
real row-linked audit event with the mark. The 24-check native registry verifier
passed, including injected audit failure rollback. Evidence:
`test-results/runtime-database/beacon-registry.json`.

The latest Cassini UI requires an explicit projected result grid before
producing geographic coordinates through the shared CRS authority; it no longer
assumes zone 37S or uses the old approximate display helper. Input accessibility
labels now contain their actual units. Model fit is distinguished from
independent datum accuracy. The final focused run passed 48 tests across five
suites, with application/test strict type checks and scoped lint also passing.

The later registry and declared-grid source built successfully as
`metardu-release-verify:20261008-beacon-registry`, immutable image identifier
`sha256:ed63bfcfbc03b022c1c7f8ec6fbac4979c95c542ca9575523ad794fc18e7126d`.
The loopback port 3006 preview is healthy and passed 21 real HTTP checks with
synthetic password sessions. Those include owned/minimal project choices,
registration with precise XY and zero height, duplicate/foreign-owner rejection,
grid-specific exact proximity distance, retired predecessor exclusion,
row-linked audit persistence, replacement replay/history and reported QA writes.
Evidence: `test-results/beacon-registry-http/result.json`.

An actual authenticated browser selected the owned project, saved a replacement,
and reloaded it. A direct database check confirmed E 500020.02345,
N 9800020.06789, height 0, the original full coordinate record and one successor.
The synthetic profile was suspended afterward, and its temporary password was
removed from the local fixture file. Evidence and screenshot:
`test-results/beacon-registry-browser/result.json` and `replacement-saved.jpg`.
The browser adapter's generic fill did not populate the native datetime control;
setting its accessible native date-field value worked, and submission/reload
then completed. This was a test-control issue, not bypassed form validation.

The packaged converter withheld geographic output without a grid, cleared the
old result after a grid edit, then displayed longitude 33.03313081 degrees for
EPSG:32736 and 39.03313081 degrees for EPSG:32737 with the same synthetic model
and latitude -1.99002535 degrees. The active input labels contain real units.
This proves the declared-grid UI path, not independent datum accuracy.

The 390-pixel mobile inspection found long replacement references squeezed
beside their badges. A source-only responsive wrapping adjustment gives the
reference a full row and passed scoped lint. It was added after the completed
image; its next package/browser check remains pending. The source evidence file
retains both the verified package snapshot hashes and the later styling hash.

The customer application and database remain unchanged. Provider OAuth,
deployment, global registry grid bounds, public control adoption, a dedicated
evidence-history viewer, eight other consumed-body findings and independent
Cassini control accuracy remain open. The full production objective is active.

## Referenced control catalogue and import

The public-beacon form used the read-only proxy and wrote absent columns. Its
map used an assumed UTM datum path, and its unreachable import dialog claimed
locked primary control without a lock or reference evidence. The separate
finder used hardcoded stations, zero placeholder distances and a geographic-zero
benchmark query rather than the surveyor's coordinates.

Current source replaces these paths with a persisted referenced catalogue,
independent review, exact same-grid proximity, shared-engine grid bearing and
owned-project import captures. Submission, reviewer queue, import/retry and lazy
reference-map interfaces use dedicated routes. The cadastral GNSS overlay now
requests reviewed same-grid marks without inventing live station availability.
Old unverified station source is retained in the non-public archive. The separate
legacy online benchmark dataset/lookup remains open; it is not a verified
national index.

Migrations 101/102 were applied only to the synthetic rehearsal, now at 107
matching entries. Point precision was widened to preserve source coordinates
beyond four decimal places. The native verifier passed 39 checks and is wired
into CI. Ten focused tests passed; strict application/test checks and scoped
lint passed. Source review remains distinct from physical verification, and
coordinate uncertainty stays unknown. See `docs/public-control-catalogue.md`
and `test-results/runtime-database/public-control.json`.

The first isolated package completed, but actual browser verification found
that the project point reader emitted PostgreSQL NUMERIC values as strings;
the control panel therefore discarded valid marks. The corrected reader emits
numeric coordinates and reference metadata. Manual registration now validates
complete finite inputs, rejects duplicate active names, requires the saved
project grid/height datum and records point/audit evidence transactionally.

The corrected image `metardu-release-verify:20261009-public-control-points`
(`sha256:6fbb95bcd988433666a2450d6a6a119ca4e018b90e203528102c6aca8f3d4aa2`)
is healthy on loopback port 3008. The current native verifier passed 44 checks,
and the production package passed 22 HTTP checks with real synthetic password
sessions. An actual browser independently reviewed a source, imported it into
an owned project and refreshed the control register. It displayed the new mark,
zero height and review-required status; precise database readback and retained
source/reference snapshots passed. Test profiles were suspended and their
temporary password removed. Browser screenshots/results are under
`test-results/public-control-points-browser/`. The 390-pixel mobile panel/table
scrolls, but the wide table and overlapping clustered map labels still need
visual refinement. The prior registry wrapping source change is included in
this package; its specific replacement-row mobile proof is still outstanding.

Compilation had stalled with approximately 4.18 GiB compiler RSS plus 1.58 GiB
builder-daemon RSS inside a 6 GiB container. Restarting only the task-owned
builder retained its cache and allowed the same source to compile in 3.9
minutes; the corrected point package compiled in 3.6 minutes. No new OOM kill
was observed, no memory limit was raised and production strict typing stayed
enabled. This is build-pressure evidence, not measured user-facing speed.

The customer application and database remain unchanged. These PWA-disabled
synthetic packages do not establish provider OAuth, live HTTPS ChatGPT behavior,
public listing, service-worker behavior or a real customer-data upgrade. The
full production objective remains active, including canonical field-control
verification, legacy benchmark replacement and the remaining UI/runtime audits.

## Field-control evidence repair (2026-10-09 Nairobi)

The old verification route accepted typed published coordinates, applied a
fixed 5 mm criterion and exposed historical records broadly. Its UI hid zero
residuals and closed after failed writes. Current source uses saved control
records, a combined source/reference revision hash, actual observation inputs
and explicit comparison criteria with their evidence reference. Visual and
height-only checks retain distinct results; unsuitable physical condition
cannot become a usable mark merely by passing a coordinate comparison.

Forward migration 103 was applied only to the marked synthetic rehearsal,
bringing it to 108 entries. It preserves historical records privately, prevents
new legacy writes and adds immutable complete field-check evidence with exact
source/reference guards. Audit and evidence commit atomically. No applied
historical checksum was changed. The native verifier passed 37 checks, including
independent RLS reads, forged snapshot rejection, audit-failure rollback,
concurrent idempotent writes and reference-change invalidation. Eight focused
tests passed, including failed-save observation retention and retry identity.

See `docs/field-control-checks.md` for the workflow and remaining boundaries.
The field-control package completed and is healthy on loopback port 3009, image
`sha256:ded6a34380dd63ce110186c15a82ecb015d093dc8d691cf71242d275c6112085`.
All 15 packaged HTTP checks passed with real synthetic password accounts. An
actual browser saved and reloaded a 3 mm east / 4 mm north comparison, showing
5.000 mm horizontal and 0.000 mm height differences. Exact database readback,
full retained source/reference/criteria evidence and linked audit identity
passed. Test profiles were suspended and the temporary password removed.

The cards wrap at 390 pixels, but the floating feedback button could obscure
text at some scroll positions. A later source-only change moves the closed
feedback trigger after the footer on phones and gives it a 44-pixel target;
its package/browser check is pending. The verified image/source hashes are
retained separately from this later styling hash. Signed-out guidance, project
selection after reload, boundary-monument reference creation, large-register
pagination, firm permissions, professional approval and live deployment remain
open. Compilation took 3.7 minutes; strict production typing passed and all 217
pages generated. PWA was disabled. A first 20-second public-health probe timed
out; later HTTP checks succeeded and Docker health is healthy. This does not
prove production uptime or provider OAuth. Customer services remain unchanged.

## Reviewed benchmark lookup and optional map references

The remaining embedded benchmark records and fake offline database were replaced
in current source by a reviewed, referenced database reader. The separate nearby
endpoint no longer interprets projected metres or missing values as geographic
coordinates. It preserves its array response; the nearest endpoint preserves
its direct-object response. Source XY/grid, zero/unknown height and explicit
vertical datum remain distinct. Geographic radius filtering and distance ordering
precede pagination, using the declared source grid instead of stale legacy
geometry. Pending/withdrawn records and incomplete review evidence are excluded;
country metadata reflects real eligible sources. Unverified source is retained
in the non-public archive. No official national control dataset is claimed.

The new online panel provides source/publisher details, real metadata, pagination,
empty/error states, sign-in guidance and stale-response protection. Real typed
tidal references can be submitted and reviewed without inventing tide readings.
The optional GNSS overlay now loads after the primary map, with a ten-second
bound and cancellation on map/grid changes. Initialization errors and reference
loading/failure are visible; viewport-cache failures do not block the map.

Thirty-two real native database/route checks and 20 focused tests passed. The
native test includes a separate analytic WGS84 equatorial-distance reference and
proves source-grid navigation despite deliberately stale legacy geometry. Map
sequencing tests mock OpenLayers/secondary controls and do not prove rendered
performance or physical field accuracy. See `docs/reviewed-benchmark-catalogue.md`.
No migration or customer-data change was made. The later benchmark package
`c65dce447f991ff48aa5ffcc1816e1b29ed0dd2bd724ac97a58f3a54aef5a485`
passed strict production compilation, 18 real password-session HTTP checks and
actual desktop/mobile catalogue inspection. A 390-pixel requested viewport had
no horizontal overflow; the feedback trigger was 44 pixels high and flowed after
the footer. The isolated port-3010 preview was healthy and the synthetic browser
credentials were retired. Its project-map browser check separately failed because
the parent queried a blocked table through the generic proxy and ignored the error.

The subsequent source correction reads the saved declaration through dedicated
owner-gated APIs. Finite coordinates, explicit point grids and zero coordinates
are preserved; incomplete boundaries fail visibly. Raw field points remain points,
not arbitrary parcels. Soft-deleted points are excluded and private responses
cannot enter shared caches. Geometry changes refresh even if the centroid remains
unchanged. The project map no longer silently overwrites computed results through
drag autosave; it directs observation corrections through the existing workflow.
OpenStreetMap attribution is restored. Twenty focused tests include real OpenLayers
empty-layer verification: no invented zero-area label or polygon is created.
These later changes have their own package/browser verification record and cannot
be attributed to the earlier benchmark image.

Provider OAuth, offline behavior, independent datum accuracy, official source
ingestion, versioned drawing edits and live deployment remain open.

The later project-map package
`2df6c300a71aa73be0995a8848afccb098a928582a2d4d75c01ea3d65a2b4976`
passed strict production compilation, 14 actual password-session HTTP checks,
and five actual browser cases: saved boundary, single point, unknown point grid,
invalid boundary and missing declaration. Primary desktop navigation remained
available. Startup checked all 108 migration entries; the loopback-only preview
was healthy. Both browser fixtures were suspended and temporary passwords removed.
Customer deployment and data were unchanged.

Browser inspection found additional toolbar contrast, label rotation, attribution
layout and layer-panel problems. Current source corrects them and removes the
legacy false north bearing for coincident vertices. Twenty-nine focused tests,
strict application/test checks and scoped lint passed; these last changes still
need packaged browser verification. Print-scale accuracy, mobile map interaction
and oblique/view-rotation annotation alignment remain open. The satellite-imagery
viewer is also still a text preview with inert fullscreen/export actions; replacing
that stub is a separate implementation step.
