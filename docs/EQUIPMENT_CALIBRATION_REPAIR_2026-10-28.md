# Equipment calibration source checkpoint

The instrument register attempted date arithmetic on missing or invalid evidence,
could classify failed results as current, and expected a response envelope the
API does not return. Registration also requested a calibration date the server
did not retain. This repairs those source contracts; it does not establish
physical calibration or deploy changes to production.

## Resulting behavior

- Registration retains metadata; calibration is a separate record requiring an
  actual calendar date and explicit result.
- Missing evidence, invalid dates, failed results and results needing review
  have distinct states without invented countdowns. Only a passed record with
  valid dates receives a current/due/overdue schedule.
- Explicit next due dates are retained exactly. Otherwise the server derives
  the due date from the observed date and adopted interval. Interval edits do
  not rewrite retained record dates.
- Calibration and review notification share one transaction. Notification failure
  cannot leave an acknowledged partial save.
- Instrument/history queries are owner bound. Success responses use the actual
  top-level contract with private, no-store caching.
- The primary page binds caches/dialogs to the account, exposes load/save errors,
  retains failed inputs, and uses labeled fields and survey-related vector
  icons. A single shared dialog replaces stacked custom panels.
- Archiving preserves the instrument and history. The primary page can include
  and restore archives. Legacy DELETE also archives while retaining its logical
  removal acknowledgment.

## Verification on 28 October

Checked Node 22 completed all 47 tests across four focused suites, application
and strict test TypeScript checks, and 12-file scoped lint with zero errors or
warnings. Tests exercise status, wire contracts, validation, acknowledgments,
account switching and primary-page error/archival behavior. An earlier combined
run timed out; the subsequent complete focused run passed without bypasses.

`scripts/verify-equipment-calibration.mjs` passed 17 native PostgreSQL checks in
the exact existing marked loopback fixture. It loads actual handlers and SQL
under the restricted role. Session/HTTP wrappers are adapted; nested savepoints
operate within an outer transaction. A real notification constraint failure
after insertion proved rollback. Other checks cover owner isolation, due-date
retention, archive history and invalid evidence. Both fixture users and all
their records were rolled back: `passed: true`, `cleanup: true`.

Native checks caught an ambiguous PostgreSQL history sort that mocks missed;
the date column is now qualified. Empty-body DELETE tests were corrected to
avoid parsing JSON before calling the route. Evidence is in the ignored local
`.cache/calibration-repair/` directory and
`test-results/equipment-calibration/native.json`.

## Limits and retained gates

Windows computer use stopped because the helper could not establish the current
browser URL confidently. No fresh authenticated visual, mobile overlap, keyboard
or administrator acceptance is claimed. The preview and CAD drawing were
preserved. Secondary EquipmentManager contracts are compatible, but silent
fetch failures and history request races still need repair and behavioral proof.
Legacy storage helpers are not an account-isolated field acceptance path.

Missing adopted intervals without explicit due dates refuse saves, but need a
more helpful validation response. Records remain user-reported and require
professional review. This is synthetic source/database evidence, not real HTTP
authentication, administrator, hardware, provider, production or field proof.
No migration, production container, customer record, billing or provider state
was changed.
