# Fieldbook browser recovery acceptance — 22 October 2026

This is source-preview acceptance using ordinary CUA browser actions at
`http://127.0.0.1:3021` and the retained, explicitly marked synthetic database.
It is not customer, production, physical-device, instrument or field evidence.
The complete production goal remains active.

## Executed workflow

The exact native HTTP fixture owner signed in through the normal credentials
form. Opening the retained leveling book preserved the raw backsight string
`1.5000`, station and remarks. Unknown opening/closing reduced levels and run
distance stayed blank. No GPS coordinates or measured boundary were invented.

The ordinary device-archive download contained the retained edits and requests.
The browser file chooser, explicit archive review, restore, page reload, reopen
and repeated restore were exercised. Imported delivery claims required server
confirmation; original verified local receipts retained their actual provenance.
Downloading the retained original produced byte-identical archive content. The
first archive was 7,759 bytes, SHA-256
`e6366b66c324d13ca815a60bbe81213578132bba091c7f6511a6be037bc69b8e`.

One narrowly scoped synthetic receipt-insert fault then rejected a deliberate
book edit. The UI reported a device save with delivery unconfirmed. An ordinary
archive export retained the failed request. The before-unload guard protected
the original dirty tab, so it was not bypassed. A second ordinary page recovered
the pending operation from durable device storage. This proves fresh-page
recovery, not an actual browser crash, network outage or forced unload.

After removing the fault, the normal Retry delivery action delivered the same
request exactly once. Independent SQL matched its independently hashed retained
input, base revision 8 and saved revision 10. Sequence gaps after rolled-back
inserts are expected. The receipt remained `fieldVerified: false`; successful
transport did not become survey approval. The final archive held five distinct
requests and five edits, including the same recovered request and receipt.
Its 19,536 bytes have SHA-256
`0d7bd65de45ffe3a7b88d185183d039d4f9fd49d606a522556a9a29e681652c8`.

## Responsive and preservation checks

At 1280 × 900, the page width fit the viewport and the observation table used
its own horizontal scroll region. At 390 × 844, document width was 380 pixels
and the original reading remained in the rendered document. Body and tested
station/reading inputs used Geist. These selected views do not establish
all-page typography or physical mobile acceptance. Saved screenshots were
visually inspected.

The independent final check at 17:15:20 UTC confirmed the recovered request
occurred once, original books and captures outside the exact new fixture matched
their prior fingerprints, all 119 historical migration records remained intact,
and all test fault triggers were absent. The source-matching synthetic ledger
contains 120 migrations. A development Fast Refresh produced an extra empty
named QA book; it was retained and explicitly excluded as part of this fixture,
not removed or represented as a customer book. The original book was preserved.

The temporary synthetic browser credential was rotated away and its profile
disabled after the run. Both testing tabs were closed and the testing viewport
reset. Production credentials and signing key were not changed. The owner has
deferred production signing-key rotation; that remains a separate open blocker.

## Defect found during acceptance

Reopening the delivered book without editing created revision 11 with the same
payload hash as revision 10. The autosave hook had compared loaded retained
content against its initial empty editor baseline. This is unnecessary revision
and audit churn, even though original observations were unchanged.

The source repair explicitly adopts a retained read snapshot as the clean editor
baseline. It does not acknowledge or discard pending request journals or receipt
claims. Imports, newly created drafts and explicit revision rebases retain their
save behavior. A generation guard prevents an older in-flight write from
acknowledging the newly opened view or subsequent edits. Two hook regressions
and a page wiring regression exercise these distinctions. The focused run passes
32 checks across two suites, strict application/test typing and scoped lint.
The post-fix ordinary browser run reopened the retained book, then observed it
for 63,144 milliseconds (more than two normal autosave periods). Independent SQL
confirmed equivalent book JSON, unchanged revision 11 and the exact same seven
immutable receipts. No explicit save was clicked during that wait.

A deliberate name edit then autosaved to the device, but correctly encountered a
stale baseline from an older restored copy. Both local and server versions were
retained. The ordinary comparison showed identical raw readings and unknown
setup, with the intended different name. Explicitly reviewing revision 11 and
saving the local copy created revision 12 exactly once. A further deliberate
name edit, without clicking Save, reached revision 13 on the normal heartbeat.
Independent SQL confirmed one additional receipt, preserved earlier receipts,
the raw `1.5000` reading and blank unknown setup. This is separate proof of clean
read reopening, stale-copy refusal, explicit review and continuing autosave;
the refused stale request was not relabeled as delivered.

The private `idle-reopen-check.json` retains the baseline, timing and result.
`browser-idle-fix-top.png` shows the final source workspace and delivered revision
13. The source preview was restarted with its existing isolated configuration
after its former listener stopped; no duplicate app container or production
credential was used. An attempted new archive export in this later run has no
verified download artifact, so the byte-identity claim above applies only to the
earlier completed download/restore exercise.

## Evidence and remaining gates

Ignored receipts, reviewed verifiers, exports and screenshots are retained under
`.cache/fieldbook-delivery/`: `browser-final-check.json`,
`browser-retry-check.json`, `browser-confirmed-archive.json`,
`browser-narrow-metrics.json`, `browser-desktop.jpg` and
`browser-recovered-narrow.jpg`. They are evidence artifacts, not release inputs.
`FIELDBOOK_NATIVE_ACCEPTANCE.md` records the separate rollback, normal synthetic
migration and 22-check real HTTP/PostgreSQL acceptance.

Still required: actual offline loss/reconnect, quota/eviction, shared-device
identity/privacy decisions, competing-tab edit acceptance, physical hardware and
measured field comparison, restored-backup recovery, coordinated pinned release
and ordinary deployed-user acceptance. No production promotion or customer
database mutation was performed for this checkpoint.
