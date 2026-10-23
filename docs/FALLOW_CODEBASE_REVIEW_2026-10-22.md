# Applying Fallow to METARDU

22 October 2026. Source analysis only; no production deployment, database access,
customer-data upload, automatic deletion or agent/hook installation.

## Repository assessment

[Fallow](https://github.com/fallow-rs/fallow) is a useful maintenance tool for
METARDU's TypeScript/JavaScript application. Its Rust workspace separates
[syntax extraction](https://github.com/fallow-rs/fallow/blob/v3.34.1/crates/extract/src/lib.rs),
[module graph/resolution](https://github.com/fallow-rs/fallow/blob/v3.34.1/crates/graph/src/lib.rs),
and a [typed analysis-engine boundary](https://github.com/fallow-rs/fallow/blob/v3.34.1/crates/engine/src/lib.rs).
The engine still has an internal core backend; this is an evolving architecture,
not a reason to reproduce its internal modules in METARDU. The reusable lesson
is to derive multiple checks from shared evidence and expose a stable typed
boundary to each caller. METARDU's CRS authority and delivery receipts should
retain that same single-source discipline.

Its graph supports unused-code, import-cycle, duplication and complexity
analysis. [Next.js conventions](https://fallow.tools/docs/frameworks/react/)
include App Router entries and framework exports, so routes need not be listed
as ordinary imports. This makes it a better fit than a simple text search for
unused exported names. The optional type-aware pass can provide stronger symbol
evidence; it was not enabled in this first review.

These are maintenance signals, not proof of engineering correctness, security,
survey accuracy, browser behavior or production readiness. Python/native worker
code, SQL compatibility, actual recovery, payments and instrument evidence keep
their existing acceptance gates. Fallow's test-coverage estimates are not measured
Jest coverage. Its health score must not become a customer-facing QA PASS.

## Executed analysis

Pinned analyzer: **3.34.1**, Node launcher on Windows. Downloaded into ignored
`.cache/fallow-tool` with `--ignore-scripts`; the normal launcher reported its
binary signature verified. Registry metadata identified the exact version and
platform package. No application dependencies or lockfile changed.

The inventory detected 11 framework/tool plugins, including Next.js, Capacitor,
Jest and Playwright, with 1,291 entry points. The completed combined run used
two parser threads and no extraction cache, taking about 54 seconds wall time.
It analyzed 3,009 files / 36,332 functions for complexity. Counts below belong
to that source snapshot, which included concurrent independent commits in this
checkout; they are not a permanent baseline or a released artifact.

| Signal | Initial result | Interpretation |
| --- | --- | --- |
| Dead-code/hygiene candidates | 1,977 total | Includes 467 files, 1,019 exports and 382 types; review consumers before removal |
| Import cycles | 5 | Includes dynamic recovery/monitoring links; inspect initialization and recursion guards individually |
| Duplication | 1,223 clone groups, 8.12% of analyzed lines | Structural similarity, not proof of interchangeable surveying behavior |
| Complexity above defaults | 2,936 functions | Prioritize customer-critical code with churn and behavioral evidence |
| Route collisions / dynamic segment conflicts | 0 / 0 | No finding in this static snapshot; not browser proof |
| Architecture boundaries / policy packs | Not configured | Zero reported violations means no rule was measured |
| Source parse degradation | One legacy migration script | Confirmed independently with Node; repaired as described below |

The bare combined command exited zero while its JSON recorded failing,
**unenforced** finding gates. That exit is not a clean bill of health. The
separate `dead-code` command exited one for its findings; after the legacy
entry-point repair it still reported 1,977 candidates and no source parse
degradation. Neither run justifies mass deletion or a passing release gate.

The first shell-redirection attempt produced no usable report. It was excluded
from these measurements. The retained completed runs use a bounded Node child
process and capture full JSON, stderr, status and timestamps. A process-local
Git setting disables the checkout's failing fsmonitor integration for those
runs; repository Git configuration was not changed.

## Findings checked against METARDU source

1. **Legacy migration entry point:** `scripts/run-migrations.js` contained a
   TypeScript non-null assertion in JavaScript. `node --check` failed at line
   247. It also implemented an older filename/checksum migration writer, whereas
   package scripts use `migrate-unified.mjs`. Repairing syntax alone would enable
   the obsolete path. It now fails deliberately with exit two, points operators
   to the supported status/dry-run/review workflow, and never loads a database
   client. Three actual-process regressions failed before repair and pass after;
   a preload guard forbids PostgreSQL client loading in those synthetic tests.
   A second Fallow run confirms the parse diagnostic is gone. No migration SQL,
   applied checksum, ledger or customer database was modified.
2. **Real obsolete import:** `scripts/engine-verify.ts` imports a missing
   `src/lib/engine/coordinates` module. That is a broken verification dependency,
   not a reason to recreate client-side geodetic calculation or guessed CRS.
   Replace this obsolete verification section with tests of the approved shared
   transformation path when that implementation is reviewed. Until then,
   `verify:engine` must not be cited as a passing acceptance check.
3. **False-positive unresolved fixtures:** the payment and set-out JSON fixtures
   named by the analyzer exist on disk. The PDF Webpack verifier writes a
   generated `parser.cjs` before using it. These findings need framework/generated
   resource context, not deleted tests or invented imports. Preserve them.
4. **Parser cycle:** `fileRouter.ts` imports `parse3D.ts`, which imports
   `calculateConfidence` from the router. This is a concrete dependency-direction
   problem. Extract shared parser metadata/scoring into a lower-level module,
   preserve compatibility exports, and test direct parser loading and actual
   output before/after. Do not change survey geometry just to lower a graph score.
   Follow-up: the approved 3D integrity repair removed this cycle while correcting
   fabricated model output and unsafe resource loading. Thirty native synthetic
   tests pass; the final graph has four remaining cycles. See
   [3D import repair](THREE_D_IMPORT_INTEGRITY_AUDIT_2026-10-22.md).
5. **Monitoring and offline cycles:** logger/Sentry and syncQueue/legacy recovery
   contain deliberate lazy links and existing guards. An analyzer cycle alone
   does not prove recursion or justify breaking retained recovery behavior.
   Review these separately with error-forwarding and offline receipt tests.

The largest churn-weighted hotspots include Fieldbook, import, engineering
station/output steps, pile-grid UI and MapClient. These match paid-workflow risk:
raw-source retention, exact revision acknowledgement, CRS provenance and reliable
deliverables should lead refactoring choices. The set-out API also contains the
highest measured function complexity (293 cyclomatic decisions). Separate
validation, ownership, computation and persistence only with realistic tests
preserving their current transaction and evidence boundaries.

## Reusable workflow

`package.json` now exposes pinned source-analysis commands (requires Node 22+):

```powershell
npm run --silent quality:codebase > .cache/fallow-analysis/current.json
npm run quality:architecture
```

These resolve `fallow@3.34.1` through npm exec, with two threads and no analysis
cache. The codebase command emits JSON; the architecture command reports cycle
findings and returns their actual gate status. Installation needs npm registry
access. Use `--silent` when saving JSON so npm's command banner does not precede
the JSON document. Both new npm entry points completed their smoke runs after
the user authorized retrying a disconnected automatic approval-review connection.
The architecture command emits the expected 3.34.1 architecture JSON and exits
one for the five cycles; the combined command emits a complete parseable combined
JSON document and exits zero with its finding gates explicitly unenforced.

Keep full reports as review artifacts. Trace claimed dead symbols and use exact
TypeScript consumers where necessary before deletion. Inspect dynamic loading,
scripts, workers and native bindings. The
[known limitations](https://fallow.tools/docs/analysis/limitations/) explain why
static configuration and reachability can be incomplete. Pin the analyzer and
review configuration before making an audit CI gate. A changed-file gate can
then prevent introduced problems without pretending inherited findings are fixed;
never hide tool errors with `|| true`, blanket suppressions or a refreshed baseline.

The existing CI Node gate includes the three legacy-entry-point regressions.
The final recovery/release/worker/legacy command passed all 52 tests with zero
skips (30.1 seconds), and the static security/migration gate passes with 119
applied migrations pinned. Old deployment/setup scripts still reference the retired filename;
these historical launchers are not the supported production promotion workflow
and require a separate audit before use.

Ignored evidence: `.cache/fallow-analysis/{inventory,baseline,after-legacy,npm-architecture,npm-codebase}.json`,
matching metadata/stderr files, `recommend.json`, and the bounded `run.mjs` helper.
The reports contain repository structure and should remain local unless reviewed
for sharing. This work is source maintenance; all broader production and field
blockers in the readiness record remain open.

## 23 October behavior-preserving integration

`DEPENDENCY_DIRECTION_REPAIR_2026-10-23.md` records the subsequent source review.
The offline and epoch extractions preserve their previous declarations/bodies;
logger forwarding is restored through an acyclic lower-level core, and package
generation uses explicit callbacks instead of asynchronous global registration.
The existing engine verification command now executes its 70 checks. Analyzer
configuration is narrowed to six exact, verified fixture exceptions, and the
cycle-focused graph is clean. The broader hygiene gate still fails for retained
review candidates. Read that record for behavior tests and the remaining
release/provider/device/field boundaries; these source results do not complete
the platform goal.
