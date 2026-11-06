# Saved-source office review: source checkpoint, 6 November 2026

The field-to-office increment now records attributed internal reviews of an exact saved surface. This is source and isolated synthetic database evidence. Production application remains `7290f5c4234b2cd94e3c5dfb399c34d074fdd444`; neither this migration nor the new review UI/API has been promoted. The existing production collaboration service still uses the old protocol.

## Resulting source behavior

- The saved topographic plan includes an Office review panel. Authorized readers see review history; recognized writers can request corrections or record “Reviewed for draft.” These outcomes remain internal reviews, with `professionalApproval:false` and `fieldVerified:false`.
- The authenticated API takes its actor from the request context. Canonical role checks and database RLS reject viewers/unrelated accounts for writes. A share lock on the parent and a verified current surface head protect new reviews against concurrent source replacement. Existing committed requests are recovered before current-head validation, preserving replay of an earlier review.
- Each append-only record retains actor/request identity, exact source revision/input hash, reference hash, canonical output evidence/digest, outcome, notes and server time. A changed command cannot reuse a committed request identity. Reads recheck the retained command and source/output evidence before returning history.
- The device retains a review before POST under an account/project/source-specific key. Web Locks serialize tabs. Equivalent requests reuse the retained identity; different work, corrupt records, failed writes and unavailable locks cannot overwrite or authorize a new submission. Retention is browser-local, not an offsite backup.
- A reload restores pending notes/outcome and the same request ID. Recovery can retry a previously committed request after the source is superseded. Only an actor/request/source/reference/output/outcome/note-matching server receipt acknowledges the device record. Late acknowledgements cannot delete newer work. Failed storage removal preserves the identity for replay. Refresh retries device recovery after storage access is restored.
- A sign-in/project/source change remounts the panel and aborts the previous request; another account does not receive the previous account's notes. No credentials, browser cookies or CAD storage are extracted or changed by a verification helper.

## Migration and preservation evidence

`src/lib/db/migrations/125_surface_source_reviews.sql` is a new additive, unapplied migration. Existing applied migration bytes were not changed. The new table has SELECT/INSERT-only runtime permissions plus an immutable UPDATE/DELETE trigger. Default direct grants are narrowed only on this evidence table. The runtime provisioner preserves these restrictions after its existing broad grants and remains compatible with databases where the new table is absent.

The actual PostgreSQL verifier uses only the existing inspected synthetic rehearsal container, loopback port 55433 and explicitly marked `metardu_runtime_verify` database. All DDL, fixtures and privilege changes occur inside one transaction and are rolled back. It does not clone or modify customer production.

Retained receipt: `.cache/collaboration-source/review-sql-rollback.json`, 21 checks passed. It covers dependencies/DDL, RLS, insert-only privileges before/after the actual runtime grant helper, actor/project/input/reference/output evidence rejection, viewer/unrelated rejection, immutable rows, unchanged raw-observation fingerprint and unchanged migration ledger/schema presence after rollback. The exact tested UP-section SHA-256 is `7522f41cf318add5a1f119907cf3dcbc063b4dd630517a564a7042957ebf18bd`.

The first stale default rehearsal database lacked the established field-observation access function; its failed receipt is retained. An independent direct default ACL initially reintroduced mutation permissions; its failed receipt and the corrected successful checks are retained. No fallback to production or edits to applied migrations were used. No persistent application of migration 125 has occurred.

## Source checks

- Combined Jest review service, API, panel, device recovery and existing surface/export recovery: **48 passed in five suites**.
- Runtime provisioner compatibility: **two Node tests passed**, with and without the review table.
- All three TypeScript projects passed after the device recovery implementation. App/test type checks and focused panel/test lint also passed after the final refresh-recovery edit; the tool project had no intervening changes.
- Focused recovery lint found one non-null assertion in a test fixture; an explicit guard corrected it and its focused rerun passed. No production behavior was weakened.
- Regression-first panel tests reproduced missing reload retention, storage-write submission without a recovery record and insufficient output-receipt binding before the implementation. A subsequent test reproduced Refresh leaving recovery disabled after storage access returned; the correction is included in the 48-test pass. Mock-response reuse and asynchronous history waits were test harness corrections, not deployed defects.

The node-environment test run emitted the existing experimental localStorage warning. This is not actual mobile/browser storage acceptance.

## Required next work and acceptance gates

1. Connect a retained review receipt into a revision-linked draft export without changing any existing registered bytes/request recovery. Define current/superseding review semantics explicitly; transaction timestamps plus UUID sorting are not a causal review sequence. Do not infer approval from the latest displayed row.
2. Finish canonical workspace/member reads, explicit generation roles and crew-save invalidations only after durable save acknowledgement. A room notice is a refetch hint, never proof of persistence. Keep original raw observations immutable and retain correction lineage separately.
3. Prove a same-origin secure WebSocket route and trusted origins, then plan one coordinated compatible app/service release with verified rollback. The installed Next router's external rewrite upgrade path is a possible source-level solution, not an accepted public route yet. Do not add a proxy container or change production DNS/tunnels merely for a test.
4. Apply the complete source increment only to the owned synthetic preview through the established migration workflow, then verify two real authenticated browser sessions, viewer/unrelated controls, reconnect/role changes, mobile rendering, failed acknowledgements/reload recovery and retained output lineage. Current Jest and SQL rollback tests are not this browser proof.
5. Implement actual Desktop account recognition through the approved external-browser/main-process authorization boundary. Desktop licensing is still unconfigured; geometry pairing is separate.
6. Preserve release, independent-surveyor/field, receiving-CAD/calibrated-print, provider, security-deferral/signing, offsite/key recovery and physical mobile installation/reminder gates. Dam structural/impoundment safety and full lifecycle support are not established by this internal review feature.

No new build, production migration, deployment, support restart, account/billing change or social publication was performed for this checkpoint.

## Normal push regression and workspace contract

The first normal push of c2371fc1 stopped on three saved-workspace tests (59 passed, three failed). The existing catch-all fetch fixture returned a surface revision list to the new review-history endpoint, so its strict validator correctly refused it and the review alert reached the assertions before the simulated export error. No push, gate bypass or implementation weakening occurred. The fixture now provides the actual role/source/hash/review-history contract for that endpoint. An integration assertion also verifies that loading the saved-source review and typing notes performs no implicit review write. The combined rerun passed **63 tests in six suites**, including the original denied-export and unreadable DXF/PDF recovery cases.

## Shared workspace admission

A separate source follow-up removes the workspace page's creator-only filter. The server database client exposes canonical projectRole(projectId) under its existing captured-session AsyncResource/RLS scope: the actor is the captured authenticated session, organization scope is resolved by the existing policy, and inherited service-role/Till capabilities are cleared. Callers cannot supply another actor identity. Anonymous clients return no role, and a removed membership is not replaced by ownership or administrator fallback.

The workspace page admits a recognized role before reading project contents, then still rejects missing/unassigned parents and keeps the existing scheme/reference handling. Surveyors, project managers and viewers may reach their authorized shared workspace; this read admission does not grant write/generation permissions or demonstrate the full viewer UI behavior.

Regression-first run: seven failed/two passed, reproducing the creator-only filter and missing captured-session role method. After implementation, **27 tests passed in five suites**, including room admission, owner-context and scheme routing regressions. All three TypeScript projects and focused lint passed. No production role, membership, SQL, permission, support or account was changed. Live two-browser acceptance remains open.
