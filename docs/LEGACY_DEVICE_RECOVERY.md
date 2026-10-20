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
- The local review transaction still needs an integrity check against the primary
  device observation: retain/reconstruct an absent source from the exact queue
  payload, and reject a conflicting primary source before delivery. No automatic
  overwrite or invented authorship is acceptable.
- Existing server raw rows without receipts remain conflicts. Reconcile them
  explicitly without replacing their retained sources. Unsupported/malformed
  legacy sources and photos remain export/manual-review cases.
- Complete CUA browser acceptance on the owned source preview, account switching,
  cold offline reopen, interruption/multiple tabs, quota, real-device reconnect,
  migration/release acceptance and physical field checks. The production goal
  remains active.

Seven local one-off helper scripts are excluded by exact `.gitignore` paths.
They include private fixtures, disabled fabricated-session helpers and source
rewrite scripts. They remain on disk and are not product tests or release proof.
