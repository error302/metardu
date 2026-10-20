# Account-bound mobile field records

Source continuation: 20 October 2026. The production goal remains active.
This work is not a deployment, disconnected-browser test or field acceptance.

## Reproduced gap

The mobile queue did not bind device captures to a user. Its automatic/manual
sync sent all queued records using the current session. In a shared project,
account B could therefore upload account A's older device capture; a missing
session still attempted the whole queue. Project-local reads also returned
other-account and unattributed legacy rows. Regressions reproduced all three
delivery cases, both unguarded HTTP preconditions and the local read/UI gaps.

## Source repair

- New mobile observations carry the authenticated capture `ownerId`. Photos
  attached in that atomic save inherit that account; conflicting photo project
  or owner information is rejected before any write. New standalone fieldbook
  photos require a fresh session matching the open book's owner.
- Both mobile collector views derive their owner from NextAuth, scope reads and
  statistics to that owner, and reset the rendered collector on owner/project
  changes. A surveyor prop is not authentication. Signed-out/loading sessions do
  not read private local lists or start a capture UI.
- Every sync pass reads the current session without browser HTTP caching. The
  lookup has a 15-second timeout and rejects non-success HTTP responses rather
  than trusting user data in a failed response. Only
  queue entries whose original payload owner matches that session are eligible.
  Optional queue-level ownership must agree too. Claims, interrupted-claim
  recovery and explicit failed-item retries apply only to that account.
- Queued database/file uploads send `X-Metardu-Expected-User`. Each server route
  derives the actual user from authentication and rejects a mismatch before
  database/file writes. The header only restricts a request; it never supplies
  identity or grants project access. Raw observations retain their existing
  body-owner check, project-role check and content-bound receipt transaction.
- Quick fieldbook capture separates committed device saves from later delivery
  failures, uses ordinary sync for new captures and reports a delivery timestamp
  only after an actual acknowledgement.

No existing payload is relabelled, owner is guessed or customer row is changed.
Unattributed historical captures/photos remain stored but are excluded from
automatic delivery and ordinary owner lists. An explicit, authorized legacy
reconciliation/recovery workflow remains necessary; do not use an owner-field
backfill to bypass it. Existing data whose owner is already explicit remains
eligible even if its older queue wrapper has no separate owner field.

The field database stays at version 1; ownership fields are additive values,
without a new object store, SQL migration or dependency. This is owner-scoped
application behavior, not encryption at rest or proof of a private offline cold
open. Earlier production clients lack the new queue guard; browser/rollback
compatibility and legacy queue retention still need actual runtime acceptance.

## Verification and release boundary

The final ownership/mobile/client/storage/raw-server run passes **95 tests in
14 suites**. Its source tests include another-account/unattributed queue
retention, no-session refusal, a changed account on the next pass, exact owner
headers, both server preconditions, signed-out UI/local-read refusal and durable
quick capture after delivery failure. Existing delivery acknowledgement, retry,
photo, raw-record and private storage regressions remain in that run.
The existing fieldbook queue suite also passes with the stricter session lookup.
`npm run typecheck` passes both application and test projects. The first lint
pass identified a hook dependency, an icon-name accessibility warning and older
untyped storage-test helpers; the source and helpers were corrected for the
final check without disabling rules. Final ESLint passes on all 21 changed
source/test files in this checkpoint. Scoped `git diff --check` also passes
with the checkout's usual CRLF notices. Receipts: `.cache/mobile-owner-types.log`
and `.cache/mobile-owner-lint.log`.

Receipts are `.cache/mobile-ownership-red.log`,
`.cache/mobile-storage-owner-red.log`, `.cache/mobile-owner-ui-red.log`,
`.cache/mobile-owner-green.log` and `.cache/mobile-owner-final-tests.log`.
Transport, sessions and native storage/database calls in these tests are
controlled fixtures; they are not physical-device or live-production evidence.

The required read-only Docker verifier passed: one production app, required
supporting services, healthy HTTP/database/Redis and the completed backup at
`2026-10-20T02:00:03Z`. Archive/header evidence is not a restore exercise.
No production service, image, SQL ledger or signing configuration was changed.

CUA creation of a tab for `http://127.0.0.1:3021/mobile/field` timed out before
returning a tab handle or UI state. Creation itself is unconfirmed; no second
tab was requested, no browser storage/state was written and no existing CAD tab
or drawing was operated on. Actual multi-tab account switching, metadata
persistence/reopen, quota, offline restart and target-controller behavior remain
unverified. Complete owner-safe offline reopening, legacy reconciliation and
the other fieldbook/offline queue implementations remain separate work.

Before promotion, review the complete pinned source, production rollback and
backup/recovery evidence, then run ordinary-account live acceptance. The known
signing-key rotation remains deferred by the owner and is an open security gate.
