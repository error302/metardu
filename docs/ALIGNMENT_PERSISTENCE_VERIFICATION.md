# Alignment persistence and private access repair

Source/synthetic checkpoint: 16 October 2026. This does not certify a road design
or prove production promotion, instrument accuracy or field acceptance.

## Reproduced failures

Ten initial API/schema regressions failed. Zero-radius endpoints were rejected;
the legacy IP loop assigned curves to the wrong point and used raw PI distances
as route chainage. PUT accepted caller-authored derived values. The VIP/station
writers used nonexistent alternate table names while reload used the canonical
tables. Transition lengths, ground profiles, target levels and vertical design
inputs were dropped. Complete templates exceeded a VARCHAR(100) column.

The read-only production catalog check confirms row security is disabled on
road_alignments, alignment_ips, alignment_vertical_ips, cross_section_stations
and earthworks_results. FORCE ROW SECURITY flags do not enable row security.
Application ownership checks are therefore required; no production vulnerability
test or customer-data mutation was performed.

## Resulting behavior

Alignment reads require canonical project read access. IP, VIP, station and
legacy quantity writes require the recorded project owner. Writes lock project
before alignment, recheck ownership inside the transaction, and record immutable
input snapshots. Another owner, unassigned ownership and stale resource identity
cannot authorize an edit through these handlers. Private alignment/station reads
explicitly use `Cache-Control: private, no-store`.

IP calculations now delegate to the same horizontal/spiral engine as project
outputs. PUT edits declared inputs and recomputes the complete route; supplied
derived fields are rejected. Unsupported geometry can remain a raw draft with
`needs-review`, issues and null computed columns. Circular TC/CT are not used to
mislabel transition SC/CS; explicit TS/SC/CS/ST metadata is retained.

VIP/station writers use alignment_vertical_ips and cross_section_stations,
matching reload. Full snapshots explicitly replace removed/empty lists;
incremental callers retain upsert behavior. Source IDs, curve lengths/grades,
sampling interval, shoulder crossfall, measured profiles, selected level source,
zero observations and negative target levels survive serialization/reload.
Missing values remain unknown. Invalid legacy template JSON is surfaced rather
than replaced with invented defaults. Late responses cannot hydrate another
project, and load failures show a retry action.

Accepted child edits synchronize only the matching selected road in the complete
project JSON. Unrelated metadata remains; cached derived quantities are removed.
Pre-edit snapshots also retain canonical input notes, including when an operator
explicitly clears a list. Multiple road headers remain separate, and ambiguous
project-only reloads require a selected road name instead of choosing a row.

## Migration and verification

Forward-only migration 110 changes the template column to JSONB and adds the
sampling interval plus horizontal/vertical source-ID fields. A malformed legacy
template aborts the migration instead of discarding the record. No applied file
or stored checksum was modified. The normal migration runner passed in the
existing marked synthetic database; its historical hashes remained unchanged.
The production catalog has no template rows requiring a JSON repair, but this
read-only compatibility observation is not a backup restore or promotion.

`scripts/verify-alignment-mirror-http.mjs` verifies exact synthetic credential
sessions against the existing 127.0.0.1:3021 source server. Its final 31 real HTTP
checks pass, including cross-owner read/write denial, unchanged owned records on
rejection, server computation, canonical-draft synchronization, template/profile
round trips, transition editing, explicit clearing and immutable note history.
The reusable receipt is ignored at
`.cache/release-verify/alignment-mirror-http/result.json`. The initial native
invalid-template migration test also passed before migration 110 was applied to
that fixture. No customer clone or migration force/bypass was used.

The focused run passes 60 tests in nine suites. Strict application/test typing,
changed/new source lint and the verification script's syntax check pass. These
include handler tests with mocked transport/database boundaries; the real HTTP
exercise above is separate evidence. No browser save/reload, instrument import,
physical print or live field proof is claimed.

The transactional-save fixtures now supply the recorded owner read inside the
transaction. An additional ownership-change regression verifies that a stale
earlier permission check cannot authorize the write, and the history-failure
case confirms it actually invokes the revision writer before rollback. The
combined persistence/transaction/mirror run passes 27 tests in three suites.

The exact existing synthetic database was reused, then returned to its original
stopped state after zero active queries and the other source-work chat's inactive
state were verified. Its data remains. Production health/database/Redis and the
single-application Docker inventory passed again. No app container, image,
builder, production schema or customer record was changed by this batch.

## Remaining release work

Migration 110 and these handlers remain unpromoted. Pending 108/109 and 110 must
pass the existing pinned release, recovery and compatibility process together.
The legacy earthworks storage path still needs its own owned-write calculation
and schema reconciliation; this batch adds its missing ownership check, not
authority for caller-supplied quantities. Project exports continue to evaluate
measured profiles freshly and ignore cached legacy quantities. Full snapshot
promotion across separate header/child API calls, revision-bound issue/control,
workflow completion gating, wider survey families and live/field/provider
acceptance remain in the main readiness tracker.
