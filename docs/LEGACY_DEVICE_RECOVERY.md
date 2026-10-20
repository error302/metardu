# Reviewed recovery of older device records

Source checkpoint, 20 October 2026. This work is not deployed or field accepted.

The mobile collector and quick fieldbook now expose an explicit recovery panel.
It checks the signed-in account's current field-recording access to the selected
project before reading older, unattributed queue records. Inventory pages contain
at most ten metadata summaries; inspection loads one selected original source.
Known-owner records are never adopted or relabelled.

The user can export the selected original payload as JSON, or original retained
photo bytes. Export is an initiated browser download, not proof that a backup
reached durable storage. Photo auto-reconciliation is not implemented.

An individually acknowledged, supported raw observation can enter the normal
bounded delivery queue. Its original payload and unknown author remain intact.
The normalized delivery hash binds the review to the inspected source. A fresh
server transaction checks project access, preserves existing receipt/conflict
rules, and records the authenticated reviewer and server time separately from
capture authorship. Only a matching server receipt confirms delivery. A reviewer
can reopen that delivered source; the UI labels its capture author unknown.

No SQL migration, dependency, database version bump or production action is part
of this checkpoint. The server route requires the existing migration 114 project
access function and receipt schema; their compatibility must be verified against
the final release candidate, not inferred from mocked route tests.

## Evidence and next work

- 105 tests in 16 suites passed in `.cache/commit-field-tests.log`, covering the
  mobile modules, collector/quick-fieldbook components, recovery panel, route and
  recording service, account preconditions and protected API routes. Application
  and test type checks, changed-file lint and `npm run security:gate` passed.
  These use simulated
  HTTP, storage events and authorization fixtures, not browser/device proof.
- The follow-up source integrity change checks the primary device observation
  and queues its review in one transaction. It reconstructs only an absent copy,
  from the exact retained queue payload, and rejects a conflicting primary source
  without overwriting either source or inventing authorship.
- Raw delivery can attach a receipt only when the current device observation
  still matches the delivered raw source. Queue removal also checks the exact
  delivered payload, account, record identity and recovery review in a native
  read/write transaction. Changed sources and failed/aborted commits remain for
  review. Transport timing/status changes do not change source identity.
- Existing server raw rows without receipts remain conflicts. Reconcile them
  explicitly without replacing their retained sources. Unsupported/malformed
  legacy sources and photos remain export/manual-review cases.
- Complete CUA browser acceptance on the owned source preview, account switching,
  cold offline reopen, interruption/multiple tabs, quota, real-device reconnect,
  migration/release acceptance and physical field checks. The production goal
  remains active.

## Follow-up source integrity evidence

Six regressions reproduced missing-primary, conflicting-primary and stale-receipt
failures in `.cache/legacy-source-integrity-red.log`. Three further regressions
reproduced deletion of changed queue entries in `.cache/legacy-queue-removal-red.log`.
The corrected source passes **119 tests in 16 suites** in
`.cache/legacy-source-integrity-final-tests.log`. The native IndexedDB event shims
exercise matching sources, unknown ownership, original text/zero values,
transaction completion/abort and changed payload/account/record identities. They
are controlled unit evidence, not an actual browser database or device reconnect.
Application/test type checks, touched-file ESLint and the security/migration
invariant gate passed; receipts are `.cache/legacy-source-integrity-types.log`,
`legacy-source-integrity-lint.log` and `legacy-source-integrity-security.log`.

CUA could not bind the existing `127.0.0.1:3021/mobile/field` tab: its CDP focus
command timed out. No browser acceptance or storage change is claimed from that
attempt. Continue ordinary-account browser/device verification on the existing
preview; preserve the owner's CAD training drawing.

Seven local one-off helper scripts are excluded by exact `.gitignore` paths.
They include private fixtures, disabled fabricated-session helpers and source
rewrite scripts. They remain on disk and are not product tests or release proof.
