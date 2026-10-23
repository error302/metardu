# Project reference declaration integrity

23 October 2026. Source, native synthetic PostgreSQL and owned-browser evidence
are recorded separately. This increment has not promoted the production app.

## Reproduced failures

The reference-system PUT handler admitted the owner before its transaction,
then updated the canonical declaration and legacy project fields without
rechecking ownership or confirming both writes. Real failure triggers showed
that a suppressed canonical write could still commit changed legacy fields;
suppressed legacy writes could report success with inconsistent records. A
valid-looking but altered returned declaration could also be accepted. A
committed ownership transfer/removal between admission and persistence still
allowed a declaration, and the GET path could return reference data after a
transfer between its access check and data read.

Malformed optional numbers were converted to undefined and silently omitted;
arrays/booleans could be coerced into numbers. Incomplete reference points and
invalid supplied heights could lose their supplied meaning. These are input
errors, not unknown observations.

The panel treated a blank ellipsoidal height as zero during factor computation,
dropped partially entered points on save, left rejected network saves busy,
accepted malformed HTTP 200 responses as success, and could hydrate a different
project with a late response. Editing coordinates/height retained a stale
computed factor and its computed provenance. A failed load could incorrectly
look like an undeclared project.

The initial native reference run reproduced **16 failures out of 22 cases**.
The new API/component suites initially reproduced 26 failures out of 27 cases;
three additional stale-computation cases were separately observed failing.
One subsequent load-state assertion was narrowed to the declaration badge and
explanatory text because its broad text query matched an unrelated provenance
option. No application behavior was weakened to satisfy that assertion.

## Changes

- PUT shares the generation advisory lock, locks reference then project rows,
  and verifies the currently recorded owner before writing. Missing, transferred
  or unassigned projects cannot acquire a declaration through an earlier check.
- Canonical persistence requires exactly one returned row matching submitted
  values, with PostgreSQL number/date representations normalized for comparison.
  The returned declaration is parsed before commit. Updating legacy display
  fields requires exactly one owner-bound update. A failure rolls back both
  representations; cache invalidation follows a confirmed commit.
- A failed rollback destroys its connection. Every outcome returns/releases
  the leased client exactly once.
- GET binds the reference payload and recorded owner in one SQL snapshot,
  preserves shared read-only access, and refuses a changed/missing owner or
  project. Successful reference reads/writes are private and not cached.
- Shared numeric parsing preserves zero, rejects invalid supplied values and
  permits genuinely blank optional fields to remain unknown. Supplied reference
  points require both coordinates; optional height stays unknown when omitted.
  Metadata requires text rather than stringifying arbitrary objects.
- Panel computation requires explicit easting, northing and **ellipsoidal**
  height. Input/CRS changes invalidate a computed factor and its provenance.
  Manual edits cannot retain the claim that the factor was computed at those
  inputs. No projection/scale engine formula was changed.
- Panel responses are validated against the wire shape and registered projected
  CRS. Unknown load status has an explicit retry; a failed/malformed save
  retains entries, releases the busy state and does not claim confirmation.
  Project identity scopes component lifetime, preventing cross-project hydration.
  Controls are disabled during save. The form supports zero display decimals
  and uses single-column controls at narrow widths with the existing font roles.

## Source and native verification

The final focused run passes **74 tests across six suites**: 33 reference-panel/
API cases plus the existing 41 drainage/grid persistence cases. Both strict
application/test TypeScript projects and scoped lint for all six changed/new
TypeScript files passed. The security gate passed with 119 pinned applied
production migrations, 677 test files and 3183 source files scanned. No migration
hash or scanner rule was changed.

The existing verifier now supports:

```
node scripts/verify-setout-generation.mjs green --reference
node scripts/verify-setout-generation.mjs green
```

Both final native runs pass **22 cases each**, for **44 real PostgreSQL cases**.
The reference cases include actual canonical/legacy write suppression, invalid
returned values, a real SQL exception, owner transfers, private viewer reads,
zero height/precision preservation and a concurrent transfer waiting until the
declaration transaction commits. A declaration changed between preparation and
drainage generation correctly invalidates the prepared targets. The original
generation cases still pass, including prior-revision preservation and 25 saves
through a two-connection pool.

Each run admits only the exact owned rehearsal service ID, loopback port 55433,
marked synthetic database and one unique comment-marked fixture schema. Six
original public-table fingerprints and all 120 existing synthetic migration
ledger entries/checksums were preserved. Both exact fixture schemas were
removed, and recorded source hashes matched at completion. Authentication and
rate limiting use a bounded adapter; copied fixture tables do not establish
ordinary HTTP authentication or production RLS acceptance.

Receipts: `.cache/reference-declaration/` contains `red.json`, `green.json`,
`source-final.json`, `computed-identity-red.json`, and the first source red
receipt is `.cache/reference-declaration-red.json`. The existing native generation
receipt remains `.cache/setout-generation/green.json`.

## Owned browser verification

After two initial control timeouts, the existing preview responded over HTTP
and the same browser tab recovered. No new application container or source
preview was started. The existing ordinary signed-in session opened the marked
synthetic project `3801daa3-b41f-41be-9a85-1b8c71b531cf` through its visible
project/settings links. No account was reactivated and no credential, browser
storage or application state was injected.

Normal UI entry confirmed blank-height refusal, acceptance of explicit zero,
and removal of the prior computed factor after selecting another CRS and after
editing height. For the WGS84 UTM 37S example E 500000 / N 9800000 / ellipsoidal
height 0 m, the panel displayed 0.999600000. The Arc 1960 numerical-model display
was 0.999600015; that observation is not a new physical-accuracy claim. Existing
scale calculations and independent method/field acceptance retain their own
scope.

At 1280x900, page client/scroll width was 1270/1270 px and panel width 624/624.
At 390x844, those were 380/380 and 332/332, with no measured horizontal overflow.
Computed styles confirmed Geist for the interface and JetBrains Mono for data.
Screenshots are `desktop-computed.png` and `mobile-computed.png` in the receipt
directory. These are computer-browser viewport tests, not physical phone proof
or an all-pages typography audit.

Neither Declare Reference System nor Save Changes was submitted in this
retained project. The viewport was reset, the page reloaded, and its original
Arc 1960 selector, undeclared canonical reference and empty factor/reference
fields were confirmed before the temporary tab closed. An independent guarded
read-only SQL comparison then matched all six original public-table
fingerprints. `browser.json` and `browser-preservation.json` retain that scope.
Actual persistence failures/ownership contention are proven separately by the
native cases above, not by an asserted browser write.

## Live and external boundaries

The required read-only production verifier passed one application and the
supporting services. Backup completion was `2026-10-23T10:25:43Z`, archive/header
evidence only. A fresh public check at `2026-10-23T18:50:27Z` passed homepage,
pricing, login and origin/public health; public release identity is still
`unknown`. No production record, application, migration, signing key or
supporting service was modified by this increment.

Coordinated packaging, migration 116 compatibility/recovery review and ordinary
account acceptance of the actual release remain open. Browser network-error
recovery is currently component-test evidence; a stalled transport/lost COMMIT
acknowledgement and full private saved-declaration browser lifecycle still need
their own acceptance. The parent settings page's project defaults/jurisdiction
claims and legacy-versus-declared stage labels were not certified by this panel
repair and should be audited in the road-preparation path.

Physical receiver/control/height evidence, approved project criteria and
professional acceptance remain external requirements. The owner's deferred
signing-key rotation and ChatGPT notice/deployment/consent gates remain in force.
The broader field-to-finish production goal is active.
