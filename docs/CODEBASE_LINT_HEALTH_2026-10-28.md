# Codebase lint and release dependency repair - 28 October 2026

This checkpoint follows 68d77258568cf2e85cb6597455a6dd367c5fba00 on the existing
workflow-readiness branch. It preserves the checkout, applied migration bytes,
production services and localhost CAD drawing.

## CI failure reproduced and repaired

GitHub run 40706231314, Security Audit job 122878989704, executes the native
release/recovery contracts without installing application dependencies. Importing
verify-workflow-upgrade.mjs eagerly imported pg and broke that contract. The
verifier now imports pg only inside its native execution entrypoint, after
argument validation. A child-process regression blocks all external runtime
packages and imports the real verifier. It failed before the change and passes
with it. The exact CI release/recovery command passes 61 tests locally.

Jest job 122878989340 was cancelled at the 25-minute job limit after 613 passing
suites; its log did not report a failed suite. The current inventory is 763
suites. The bounded CI allowance is now 45 minutes, retaining two workers and
all coverage thresholds. A completed run on the new source is still required.

## Lint and typing scope

The final full scan at 2026-10-28T17:45:29.870Z checked 3,354 owned files with zero
ESLint errors and zero warnings. Its source inventory was unchanged during the
run. Every API query is typed: zero untyped among 790 queries across 328 routes.
Disable directives decreased from 114 to 103; no ratchet baseline was raised.
Application, test and tooling TypeScript projects all pass separately.

The inventory now covers Git-owned JS, JSX, TS, TSX, MJS, CJS, MTS and CTS,
including untracked product files, root configuration and hidden OAuth routes.
Git-ignored private QA scripts, vendored agent examples and archived documentation
examples remain outside product lint. Explicit scoped runs retain ESLint's own
file enumeration and ignore rules; the bounded-runner equivalence tests pass.

Operational JavaScript receives syntax-aware ESLint without type-dependent
TypeScript rules. Application and tooling TypeScript retain strict checking.
This is not a claim that the earlier release-tool JavaScript type-safety debt is
closed. That separate gate remains open. The only dependency addition is pinned
dev-only @types/eslint 8.56.12; runtime dependencies are unchanged.

Product fixes include validated fee-quote input, explicit CRS boundaries for
map/overlap helpers, truthful unknown area accuracy, typed fieldbook and PDF
contracts and retired community discussion/review endpoints returning 410.
Tests use checked response helpers and complete web Request/Response fallbacks;
production validation and coverage requirements are preserved. Focused survey,
PDF, map, retired-route and payment/quotation suites pass. Full coverage and
browser/accessibility admission remain separate requirements.

## Production identity and promotion admission

Read-only docker:verify passes for the single existing app and required services.
The exact running app image is
sha256:06103336484035d2aad7d3a1d45cf9bb37b8a814507b190108f5ae1586a9d0b0,
whose OCI source revision is 08fae42763aae6d6c4fa24e7f32ec359bf41ddc7. Runtime
METARDU_BUILD_SHA and public releaseId remain unknown. A source push is not a
production deployment.

The release planner now obtains its rollback revision from the exact inspected
running image's immutable OCI label and checks it exists in this repository.
Conflicting runtime identity, missing/malformed labels, unrelated applications
and image-ID mismatches fail closed. The release/registry/import contract run
passes 21 tests after this addition; scoped release ESLint passes.

Worker artifact verification still fails: image
sha256:30e83e33403f9e5accb6eddeccb940ece69df71d4a7b27d69406bf96f453241a lacks
current LiDAR/baseline modules, shared contract, distributions and task registration.
The rollback-current app tag also differs from the running image. No production
image, tag, container, migration, account or provider state was changed by these
source repairs.

Before promotion: pin the new committed source, pass its own CI, rerun native
119-to-128 upgrade/rejection evidence, establish current recovery and app/worker
rollback compatibility, then build/promote one coherent candidate in the existing
stack. Preserve the rejected customer-clone boundary; do not reuse old restore
proof as current evidence. Known browser/a11y failures, deferred signing-key
rotation and provider/CAD/print/field acceptance remain in the ordered register.

Private receipts are under .cache/lint-cleanup: final-lint.json,
final-lint-inputs.json, final-lint.log, types.json and focused test logs.
