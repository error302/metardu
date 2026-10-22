# Fieldbook archive recheck and comparison layout

22 October 2026. This is source-browser/synthetic evidence, not a production
release or device/field acceptance record. It continues the native handoff in
`FIELDBOOK_NATIVE_ACCEPTANCE.md`.

## Executed ordinary-browser continuation

The existing in-app source tab and host preview at `127.0.0.1:3021` were reused.
The page confirmed the explicitly labelled synthetic project and displayed the
retained archive and three previously delivered local snapshots. No browser
storage internals, session injection, customer login or CAD drawing were used.

`Review and recheck` opened the retained source with two edits, two requests and
zero unreadable records. The acknowledgement started unchecked and restoration
was disabled. Explicit review and `Restore reviewed archive` completed without
adding duplicate snapshots. The same tab was reloaded; the retained archive and
the same three snapshot identities/revisions reappeared. Existing verified local
delivery results stayed present; this does not prove that imported receipt claims
can establish a new delivery acknowledgement.

The ordinary `Download original archive` control produced a new browser download.
Its **7,759 bytes** exactly match the retained original, including SHA-256
`e6366b66c324d13ca815a60bbe81213578132bba091c7f6511a6be037bc69b8e`.
The original two edits/requests and account/project scope were independently
checked. No journal was cleared to simulate a new device.

Twelve independent checks at **10:22:11 UTC** compared the downloaded bytes,
the two owned server books and six receipts against the pre-recheck baseline.
The book contents/revisions and receipts matched, all receipts remained
explicitly unverified, the 120-entry schema matched source with all 119 prior
ledger rows preserved, and original book/capture/batch fingerprints outside the
declared synthetic project matched. These are logical record checks, not a
byte-identical database/sequence snapshot or an actual backup restore.

Ignored evidence under `.cache/fieldbook-delivery/`:
`verify-browser-recheck.mjs`, `browser-recheck-result.json`,
`browser-recheck-download.json`, `browser-device-recovery.json` and
`browser-archive-recheck.png`. The baseline was preserved rather than overwritten.
Concurrent synthetic QA subsequently advanced this project's books and added
separate snapshots; the counts above describe this checkpoint, not later state.

## Confirmed comparison layout defect and repair

The ordinary `Compare with server` flow rendered both retained raw values and
the current server revision with an unchecked review acknowledgement. At the
normal desktop viewport, DOM measurements showed a 291.5-pixel recovery panel
and a 257.5-pixel comparison grid. Its viewport-based `lg:grid-cols-2` rule split
each copy into only **122.75 pixels**, despite the narrow sidebar container.

The grid now fits columns to available container width, with a 20-rem preferred
minimum that shrinks to the container on narrow screens. The same live source
comparison then measured one 257.5-pixel column for both copies. Raw values,
revision checks, explicit review and save/delivery behavior are unchanged.
The recorded DOM measurements are retained in `browser-review-layout.json`.
The pre-change screenshot is `browser-comparison-before.png` in the same ignored
evidence directory. All 11 existing recovery/archive component tests pass;
their receipt is `review-layout-tests-final.log` in that directory. Scoped lint
is recorded in `review-layout-lint-final.log`.

A temporary 740-by-860 viewport rendered the mobile recovery inventory. Before
a fresh tablet comparison could be completed, the synthetic QA account was
disabled by the continuing cleanup and its temporary credential file removed.
The browser then showed an account-confirmation error; a separate read-only
query against the marked synthetic database confirmed that exact actor suspended.
No account was re-enabled
and no session gate was bypassed. The viewport override was reset and the same
tab retained for continuation. Full tablet comparison and phone/device acceptance
remain open; the desktop container measurement alone does not prove them.

The required read-only production runtime verifier passed for the existing stack;
no deployment, migration, application build or production restart was performed
in this continuation. Backup freshness remains archive/header evidence only.
Outstanding recovery work includes new-device import, quota/eviction and
interruption handling, offline cold reopening, account/project switching and
shared-device privacy, coordinated release and physical field acceptance.
