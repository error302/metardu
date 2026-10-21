# Active-book numerical checks — 21 October 2026

This source checkpoint repairs observed Fieldbook credibility defects. It does
not establish project acceptance, field verification, regulatory approval or a
production release. The broader goal remains in `PRODUCTION_GOAL.md`.

## Corrected authority and input boundaries

The old sidebar ran a separate traverse monitor even in a leveling book, parsed
bearings with `parseFloat`, assumed an urban class and showed zero misclosure
without observations. Its unused full view supplied invented heights/weather
and a test-leg button. Separate main/mobile summaries used different result
fields and inferred cadastral acceptance; the instant-feedback path skipped bad
readings and substituted zero start coordinates. Those active Fieldbook paths
have been replaced by one read-only presentation of the active book's existing
engine result. The redundant Fieldbook instant-feedback component was removed.
The separate map component and established computation engines are preserved.

Leveling now shares `computeLevelBook` between the page and computation hook.
It requires finite complete numeric strings, a reading in each row, station
identity and an initial backsight, and rejects invalid or overflowing calculated
results. Invalid raw strings remain editable, savable and exportable as JSON/CSV;
they cannot silently disappear into a calculated PDF. Zero and signed values
remain numbers; this is validation, not observation correction. The retained
capture archives are not rewritten. A backsight alone no longer appears as an
arithmetic pass or measured zero closure in either active summary.

Leveling misclosure requires a supplied closing RL and forward sight. Missing
run length remains unknown. The existing 10√K mm allowance is explicitly labeled
an engine reference requiring project-criterion review. Traverse closure uses
the declared closed/link target through the established engine; open traverses
show closure unassessed. Precision comes from the result, without an invented
epsilon denominator at zero closure. Control summaries count only finite
calculated points in the active setup and require independent checks.

The hard-coded 0.05 m/1:5000 failure notifications and statutory verdicts were
removed from this route. A save-time "independent closure" adapter also compared
scalar linear error against an invented delta vector, producing a 100 m mismatch
for a consistent synthetic triangle. Its replacement checks actual adjusted
delta sums against actual start/end coordinates in the engine module. Missing
or non-finite evidence is unassessed. This internal numerical identity is not
an independent field check. The unrelated polygon-area adapter is no longer
used to imply verification of an undeclared Fieldbook polygon.

## Saved-book preservation

Opening a saved book called the same preservation handler as explicit save.
That handler previously created an empty copy even when the workspace was
untouched. It now skips untouched content before navigating. Existing named,
edited, source-linked and already saved books still require preservation;
existing empty books are not deleted. This closes a separate path from the
earlier autosave/import guard in `CAPTURE_TO_FIELDBOOK.md`.

During CUA acceptance the browser displayed a retained local empty copy
`02904668-2b6e-4ebb-ad42-afeb8c9f9c09` and one pending operation. It was not deleted
or claimed delivered. Read-only marked-database inspection at the end still
found one native book, two unchanged raw observations, two unchanged archives
and zero survey points. Browser inventory temporarily differing from native
inventory and the pending operation remain recovery/reconciliation work.

## Evidence and limits

- Red logs: `.cache/fieldbook-qc-red-final.log`,
  `fieldbook-qc-backsight-red.log`, `fieldbook-qc-precision-red.log`,
  `fieldbook-qc-notification-red.log`, `fieldbook-qc-save-red.log` and
  `fieldbook-qc-roundtrip-red.log`. They reproduced wrong/missing active-book
  checks, silently skipped invalid input, fabricated zero/precision, unadopted
  failures, an empty copy and the invalid coordinate adapter.
- `.cache/fieldbook-qc-verified-tests.log`: 35 checks across five suites passed.
  It includes real desktop QC and mobile-shell composition, existing engine
  results, same-input PDF checks, raw-string saving and coordinate inconsistency
  detection. The final test mock cleanup needed an element rather than null;
  it was corrected without weakening types, and the 19 page checks passed again
  in `fieldbook-qc-final-page-tests.log`.
- Scoped lint passed in `.cache/fieldbook-qc-verified-lint.log`. Final application
  and test typing both passed in `fieldbook-qc-final-all-types.log`, after the
  typed test cleanup correction recorded above.
  Security passed in `fieldbook-qc-security.log`, with 119 applied migrations
  pinned. No migration, dependency or production promotion was performed.
- Ordinary CUA reopened the existing synthetic source-linked book at the owned
  `127.0.0.1:3021` preview. Clearing closing RL showed "Closing RL required";
  entering `100.0000` showed `0.2500 m`; restoring `100.2500` showed `0.0000 m`.
  The restored book was explicitly saved and confirmed saved by the UI. Phone
  viewport acceptance showed the same card, active leveling entry and visible
  draft source references. The rendered document had equal client/scroll widths
  of 380 px, and the viewport override was reset. This is one responsive fixture,
  not full keyboard/device/field acceptance.
- `.cache/field-sync/capture-browser-qc-final.log` confirms native counts and
  original-source equality. The restored native source-linked book data matched
  the previously verified JSON export exactly. The synthetic fixture is retained.
- `.cache/fieldbook-qc-runtime.log`: required production/supporting services were
  healthy, one application, backup completion `2026-10-20T02:00:03Z`. The initial
  restricted check lacked Docker access; the reviewed host check succeeded.
  Backup archive/header evidence is separate from restore recovery.

Chrome's older tab lost its debugger attachment. A fresh tab in the same approved
browser/session recovered access without another login or a storage shortcut.
The source preview still has intermittent account/source request delays; those
and the retained local pending operation are unresolved. Project-criterion
adoption/provenance, observation/control/design revision binding, complete
leveling sequence checks, other book-type/browser/long-report acceptance,
independent numerical/field evidence and the full production release gates remain
open. Removing inferred acceptance does not implement those missing workflows.
