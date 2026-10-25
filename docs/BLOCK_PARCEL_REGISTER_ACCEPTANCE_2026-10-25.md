# Block parcel register and metadata commands

This source checkpoint continues the owner's large-project and professional-UI
direction. It does not establish cadastral field acceptance or production release.

## Resulting behavior

The block-detail page replaces whole-register and whole-block-list downloads with
one owner/project/block-bound read. A single PostgreSQL statement returns global
block counts, supplied known-area totals, explicit unknown/invalid values and a
stable 50-row page. Search treats `%`, `_` and backslash literally. Status filters
include unrecognized historical values. Totals remain whole-block totals when
the visible register is filtered or paged.

The query selects page identifiers before reading display metadata. Geometry is
never transferred to render the register. Area totals remain exact decimal text;
unknown areas are not presented as zero. Loading/failure cannot fabricate an
empty block, and failed refreshes retain explicitly labelled confirmed data.
Old project/page replies are aborted or ignored and successful replies must match
the requested scope, filter and clamped page.

Create/edit forms use UUID strings and the authoritative shared field schemas.
Blank fields may be explicitly cleared to null; omission preserves the existing
field. Identifiers are trimmed before required-length checks. Supplied hectare
areas must fit the database's six-decimal quantum; ordinary floating-point noise
is normalized, while zero, negative, nonfinite and materially excessive precision
are rejected. The accepted maximum matches NUMERIC(12,6).

Metadata commands now lock the actual owning project, block and parcel inside one
transaction. Supplied expected project/block identities are enforced. Edits send
only changed fields plus the exact six-digit PostgreSQL timestamp and loaded
revision. Comparisons occur in PostgreSQL without millisecond truncation. A
successful edit advances the persisted revision, and a stale timestamp/revision
refuses the change. Missing, invalid, altered or unchanged-version acknowledgements
roll back the complete command before a success response.

Deletion requires the loaded version and explicit UI confirmation. The metadata
register refuses deletion when geometry, a non-pending status, confirmed LR,
parcel traverse or original parcel-import coordinates are retained. These are the
specific checked dependencies, not a claim to cover every future artifact/link.
An eligible pending metadata record must be deleted with an exact identity and
scope acknowledgement; a suppressed delete cannot report success. Existing
audit/version history remains separate from the live register row.

Forms and controls remain in normal page flow; tables scroll inside their own
containers. Actions have meaningful SVG icons and accessible names. CSV import
retains its reviewed request/receipt protocol and refreshes the bounded register.
The traverse panel now receives a UUID string; its prior computation behavior is
otherwise unchanged and is not accepted by this checkpoint. Deliverables navigation
leads to the existing project review stage rather than an unchecked row-status
shortcut to a deed plan.

## Verification

- The original mutation handlers failed 20 of 25 native cases. Among the failures:
  a mismatched supplied project still created a parcel; invalid response validation
  happened after committed writes; an owner transfer admitted an update; and
  deletes discarded retained traverse/import evidence. Five baseline cases passed.
- Nine UI cases failed against the old register. The current eleven cover bounded
  reads, genuine unknowns, UUID create requests, sparse/versioned edits, retained
  stale drafts, mismatched acknowledgements, simulated delete confirmation,
  retained-evidence refusal, literal filtering, paging and failed refreshes.
- A shared-input red case reproduced `0.1 + 0.2` remaining unnormalized, which
  would disagree with the stored six-decimal value. The corrected input suite and
  the combined regression run pass: **59 tests in eight suites**.
- `node scripts/verify-parcel-metadata-commands.mjs green` passes **42 native
  PostgreSQL cases**. The fixture mirrors automatic timestamp updates and
  transactional audit/version snapshots. Failed acknowledgements preserve both
  the parcel and audit rows. The suite also covers exact read/edit/read tokens,
  concurrency, owner/scope admission, retained evidence, malformed/unknown values,
  stable filtered pages and read failure.
- The final synthetic 10,000-parcel profile returned 50 rows and a 22,006-byte
  overview object. Fixture population took 2,770 ms; the first two page reads took
  66/63 ms on this run. These are observations through a bounded authentication
  adapter, not production latency or concurrent-crew acceptance.
- A previous simultaneous-verification run hit the 10-second statement timeout.
  It is retained in `concurrent-verification-timeout.json`; timeouts were not
  raised. Stage logging and the subsequent isolated run resolved the single-run
  acceptance check. Concurrent-load/resource acceptance remains open.

Reports are under `.cache/parcel-metadata-commands/`: the initial `red.json`,
`version-edge-red.json`, `input-red.json`, `ui-red.json`, final `green.json`,
`ui-green.json` and `regression-tests.json`. The verifier checks the fixed rehearsal
service ID/purpose/loopback port/database marker, uses no public search-path
fallback, fingerprints the original public records and migration ledger, checks
source hashes and removes only its uniquely marked fixture schema. Its geometry
sentinel tests payload omission and metadata preservation, not PostGIS topology.
It is not ordinary-account HTTP, browser or production RLS proof.

App/test type checks pass. Navigation checking reports 237 page files and 823
static links with no unmatched references. No source migration was required by
this checkpoint, no applied migration changed, and production was not rebuilt,
migrated or restarted. Existing source-preview config and independent dirty work
remain preserved.

## Compatibility and remaining work

The new UI is the only discovered source caller of the parcel edit/delete routes.
Delete callers now need `updated_at`; the new UI additionally sends `base_revision`
and expected project/block IDs. Existing create callers may omit expected project
ID, in which case the actual block's project is admitted and locked. Edit callers
without a revision still require the exact timestamp. Rollout must keep the client
and server contract coherent.

Global block/parcel uniqueness across older raw/design writers still depends on
the pending migration 117 index and its legacy-duplicate preflight. This fixture
contains that index. Full applied-schema/RLS, migration compatibility, restore and
coherent-release acceptance remain required before promotion. The audit fixture
mirrors selected trigger behavior, not the full installed policy/function set.

An uncertain manual command response stays unconfirmed; its draft is retained and
the user can refresh/review the authoritative register. This does not add a durable
manual-command replay receipt across device/restart. The separate CSV protocol
does retain exact request receipts. Background work, broader client recovery,
remaining block-management/map paging, explicit traverse/parcel selection, legacy
traverse contracts, exact output/package binding, team isolation, instrument,
receiving-CAD/print, professional field and administrator/browser/mobile acceptance
remain active work. The public parcel endpoint's privacy/CRS/authority defects and
the existing worker, security-deferral, provider and recovery gates remain open.
