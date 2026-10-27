# GitHub checkpoint and remaining work

Source checkpoint `668e8cd3ed17a5b0a917bc2166e8b5056de9df32` is pushed to
`codex/metardu-workflow-readiness-2026-10-12`. Its real pre-push gates pass.
The existing production stack and local CAD drawing are preserved. A GitHub
push is not production promotion.

## Verified and diagnosed

The patched source passes 7,138 local runtime tests (ten explicitly skipped),
strict application/test typing, scoped lint, the native persistence checks and
four new Zod migration contracts. GitHub run 40539757745 confirms zero runtime
and full dependency findings, and passes TypeScript, API row typing, i18n,
Python worker tests and the native PostgreSQL design/set-out regression.

The same run reveals a previously masked static security-job setup defect:
importing migration logic immediately imports `pg`, although that job
deliberately has no installed npm dependencies. The follow-up loads `pg` only
inside explicit migration-verification and synthetic-upgrade execution.
Their ownership, database configuration and execution guards are unchanged.
A cold-module regression outside the checkout first reproduces missing `pg`
for both modules, then passes with the fix. The complete 54-test release/recovery
script command and 12 focused migration Jest tests pass (one integration test
skipped); the actual security invariant gate passes with all 119 applied
migration hashes pinned. Await the follow-up's own Linux CI result.

Read-only HTTP checks on 27 October return 200 for the live homepage, login and
health endpoint. An anonymous dashboard request reaches login with its intended
dashboard destination retained. In the owned 127.0.0.1:3021 source preview,
the header and hero have Open dashboard links; clicking one reaches the same
sign-in destination. This does not verify a signed-in dashboard or administrator
workflow. Current screenshot capture times out, so these new observations do
not establish a fresh visual overlap/responsive review.

## Ordered remaining repairs and acceptance

| Priority | Area | Concrete next work |
| --- | --- | --- |
| P0 | CI admission | Confirm the follow-up security job, new revision's full coverage, native preflights and Linux web/mobile builds. Keep all failures blocking. |
| P0 | Whole-repository lint | Both preceding lint jobs exhaust V8 heap. Make the full scan complete with bounded resources, then fix any actual findings without increasing baselines or disabling rules. Scoped lint is already clear. |
| P1 | Browser navigation and fieldbook | Diagnose preceding failures against the current product contract: desktop/tablet navigation, homepage metadata, login registration link, fieldbook Control observations and PDF/CSV/JSON delivery controls. Several landing/login expectations describe superseded layouts; preserve meaningful behavior checks when correcting them. |
| P1 | Six tool pages | Repair and rescan CORS networks, geofence, legal description, pin cushion, pipe network and stakeout report. The preceding 96-route axe run reports missing labels/select names/button names and contrast findings on these six pages. |
| P1 | Real authenticated UI | Verify dashboard-to-project/field/map/drawing navigation and loading/error/empty states using existing authorized accounts, including actual administrator screens. Check desktop, tablet and phone widths for overlap and keyboard accessibility. Do not reopen closed synthetic accounts or touch the user's CAD drawing. |
| P0 | Safe production promotion | Review pending migrations 115–123, current worker artifact drift, the rollback image/tag mismatch, release allowlist compatibility and actual recovery evidence. Do not bypass the earlier rejected customer clone or treat an archive header as restore proof. Promote one pinned candidate only after admission. |
| P0 | Deferred security work | The owner-deferred signing-key rotation remains open. Preserve Cloudflare containment of the legacy public parcel API. |
| P1 | Professional acceptance | Complete real instrument import/control checks, independent numerical review, receiving CAD interoperability, calibrated print and provider purchase/webhook/entitlement lifecycle checks. |
| P1 | Large and offline projects | Validate ward-scale blocks/teams/permissions, interrupted observation capture and acknowledged delivery, device quota, multi-tab/reconnect recovery and actual mobile/PWA behavior with retained original evidence. |

The broader engineering platform and international shared core remain active
work. Source, synthetic, provider, production and physical field evidence are
separate. No clean-Git or passing-test claim closes the remaining gates.
