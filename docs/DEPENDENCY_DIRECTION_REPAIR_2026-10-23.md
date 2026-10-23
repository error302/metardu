# Dependency direction and behavior preservation

23 October 2026. This applies the Fallow review to the existing source. No
production deployment, database migration, device-store manipulation or provider
request was performed. The wider engineering/commercial goal remains open.

## Behavior before graph scores

The pending dependency refactors removed graph cycles, but the first behavioral
review reproduced a logger regression: server errors did not reach monitoring
unless another module had imported the monitoring adapter first. Two of four
regressions failed even while Fallow reported zero cycles. This is why a graph
result cannot substitute for application behavior.

`logger.ts` remains the public entry point and installs lazy server forwarding.
The logger implementation and shared recursion marker live in `loggingCore.ts`;
the Sentry adapter depends on that lower-level module. Reporting therefore no
longer creates a return dependency to the public logger. All four regressions
pass: forwarding without a monitoring preload, bounded development capture,
`NO_FORWARD`, and ordinary/non-Error logging. The SDK is mocked; these tests do
not establish live alert receipt or provider configuration.

Package generation now receives its document generator explicitly from the
request/assembly caller. The asynchronous module-global registration and mutable
fallback are removed. Missing core documents without a generator fail before
document writes and name the missing artifacts. Existing ready documents can
still be packaged. Concurrent synthetic packages retain their own project,
owner, callback and project-owned storage files; the actual JSZip archives are
inspected. This is generation/packaging behavior, not professional issue approval.

The legacy `verify-export-repair.ts` caller also passes the generator explicitly.
That script still selects an account and writes project data using environment
credentials; it was **not executed** or accepted as a safe production verifier.
Its existing behavior requires a separate guarded-fixture repair before use.

## Storage and epoch extraction

The offline database opener and its types move below the queue/recovery modules.
The database name, version 3, stores, indexes, open-promise singleton and upgrade
body retain their previous definitions. Queue compatibility exports remain.
No browser storage was opened, rewritten or cleared for this extraction review.

The epoch modules now share their existing types, Earth/plate constants and
conversion helpers through `epochBase.ts`. The rigorous implementation depends
on that lower layer; the public epoch module keeps its compatibility exports.
The existing plate model and equations were not replaced or independently
certified here.

An independent TypeScript declaration comparison against starting Git revision
`7dde4fdb7f84fdae040680c00c975c9abbc1ca3d` verifies **ten epoch and seven offline declarations**, excluding only
comments, formatting and export visibility. A trailing-comma difference was
resolved before that exact-body comparison passed. Local evidence is
`.cache/fallow-analysis/extraction-preservation.json`. Existing epoch and retained
legacy-delivery tests complement the comparison; in-memory IndexedDB proof
remains separate from real-device durability.

## Analyzer configuration and verification

The installed, pinned Fallow 3.34.1 launcher was reused without installing new
application dependencies or changing the lockfile. An npm offline lookup had
no cached registry response; that failed lookup is not an analyzer result.

The broad JSON/payment/test-helper unresolved-import suppressions were removed.
An unmasked run reports seven false-positive imports to six existing tracked,
parseable JSON fixtures. Only those six exact specifiers remain excepted.
Whole-directory/wildcard exceptions and the unreviewed dependency-ignore list
are gone. The generated PDF-parser require has one line-specific annotation;
the actual Next Webpack parser check passes and preserves original decimal text.
No missing production source module was invented or hidden.

The cycle-focused architecture run exits zero with no import/re-export/package
cycles. Boundaries and policy packs are **not configured**, so their zero counts
mean those checks were not measured. The broader dirty-source hygiene snapshot
still reports **1,842 review candidates** and exits one. Its unresolved-import
count is zero with the six exact exceptions. No dead-code candidates were
automatically deleted, no passing hygiene baseline was manufactured, and these
counts are not a pinned release or customer-facing quality score.

The principal regression run passes **110 checks across ten suites**, including
the package/logger/epoch/offline cases plus the exact payment and set-out fixture
consumers. `npm run verify:engine` passes 70 checks after replacing its missing
module import with the existing geodesy module and including existing declaration
files. Its UTM round trips are explicitly internal-consistency checks; they do
not certify independent grid accuracy. Strict app/test types, scoped lint and
the source security gate pass before integration. The separate 12-check
geodesy-coordinate suite also passes. The dependency resolution/type annotations
do not replace its numerical implementation. The final scoped lint run has no
warnings or errors, and all 119 applied migration hashes remain pinned.

Ignored analyzer evidence: `.cache/fallow-analysis/refactor-review*`,
`refactor-unmasked*`, `refactor-final*`, `refactor-verified*` and `refactor-hygiene*`. Reports retain their
actual statuses and local repository structure; nothing was uploaded.

## Remaining work

This source integration does not close Linux/PWA packaging, coordinated
promotion/rollback, customer/offsite recovery, payment lifecycle or field proof.
The deferred signing-key rotation remains open. The unrelated horizontal-curve
component cleanup and active topographic workflow work remain outside this
commit. Review of that curve component also found a pre-existing set-out path
using tangent length as TC chainage and applying a degree conversion to an
already-radian angle; its field set-out behavior must not be accepted on the
basis of this dependency milestone.
