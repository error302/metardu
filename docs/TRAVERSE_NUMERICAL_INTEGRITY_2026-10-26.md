# Traverse numerical integrity: source checkpoint

26 October 2026, Africa/Nairobi. This checkpoint repairs numerical reduction and
its presentation. It does not complete retained traverse intake, promote an
application/worker image, or establish survey acceptance.

## Reproduced defects and repairs

The new regression suite initially produced 31 failures and two passes against
the old engine/print path. Separate failing tests reproduced the connector's
missing criterion admission, the live checker's inferred standards and blunder
diagnosis, field-form row filtering/default heights, preview averaging and
invalid printed DMS rounding. These failures preceded their respective fixes.

- Every observation is checked. Incomplete rows, prefix values such as `100m`,
  nonfinite values, invalid DMS components, nonpositive distances, vertical-only
  legs, partial closing control and numerical overflow refuse computation.
  Scientific decimal notation is supported; hexadecimal/prefix parsing is not.
- Original observation strings, row order and metadata are copied into a result
  snapshot. Later caller edits do not rewrite that snapshot. This is an in-memory
  snapshot, not durable retention of original file bytes or control-entry text.
- Paired face angles are averaged along the shorter circular arc. The
  359°59′ / 180°01′ example now gives north rather than south. Exactly opposite
  adjusted readings are ambiguous and refused. Signed face differences are
  exposed in arcseconds, without inventing a face-agreement tolerance.
- Missing opening level leaves all computed reduced levels unknown. Missing
  instrument/target height leaves that height difference and subsequent reduced
  levels unknown. Explicit zero levels/heights are retained. No datum is inferred.
- Open traverses have null misclosure, closing error in millimetres and precision
  ratio. An exactly zero computed closing error has no finite precision ratio;
  no artificial denominator or infinity is inserted. Floating-point residuals
  remain numerical values, not independent instrument precision evidence.
- An optional nonnegative **millimetre** linear-misclosure limit must have a
  nonempty job-specification reference. Without it, closure is reported but
  acceptance is `not_assessed`. With it, only the stated linear limit is compared.
  No country, accuracy order, governing standard or approval is inferred.
- Bowditch corrections still use the existing shared `bowditchCorrections`
  kernel. The result retains unadjusted legs/misclosure and adjusted coordinates.
  Forced endpoint agreement does not prove the observations were correct.

The legacy observation convention is explicit: `station` names the target
coordinate of the next leg, and supplied paired angles use clockwise
backsight-to-foresight semantics. `bs`/`fs` labels are retained metadata; this is
not a setup-network solver and does not reduce arbitrary raw circle observations
with independently observed backsight zeros. Correct instrument-file admission
and a versioned explicit setup/target model remain required.

## Connected presentation and API behavior

`TraverseFieldBook` admits complete numeric text without prefix parsing, stops
dropping rows, and stops manufacturing 1.5 m heights in manual/CSV entry. It
allows mathematical open/loop drafts without the former blanket legal claims.
Optional limit/reference fields enable a stated comparison. Edits invalidate
old results and show a recomputation state. Responsive control columns and the
existing geomatics SVG symbols replace literal icon placeholders in this view.

The field preview and printed DMS use the same circular mean/display carry as
the core. The printed computation sheet displays unknown values, states limits
in millimetres (the former sheet mislabeled them as metres), and uses the
closing-minus-opening target offsets in its Bowditch formula. It no longer
assigns Arc 1960/UTM 37S or a Nairobi/MSL height datum. Supplied reference labels
are identified as supplied, and missing labels remain unknown. It always uses
the draft-review block, with no prewritten certification assertion. Observation
labels and criterion references are escaped before HTML interpolation.

`liveToleranceChecker` compares the same supplied criterion rather than adopting
an order from a survey-type menu. Angular closure remains unknown without the
necessary observation/layout/orientation model. Its compatibility `rdmChecks`
field contains no successful conformance claim. The largest allocated Bowditch
correction is described as an allocation, not evidence identifying a blunder.
Separately supplied LSA values remain explicitly unverified statistical inputs;
leveling tolerance needs its own adopted specification. Badge details remain in
flow and use SVG symbols. The legacy compliance adapter explicitly carries an
unknown angular misclosure; this does not validate that separate legal workflow.

The ChatGPT traverse tool accepts paired limit/reference fields, supports
missing heights, preserves unknown levels and permits null precision/allowable
values in its output contract. The compatibility key `accuracy_classification`
now contains comparison text rather than an inferred legal accuracy class.
Its CRS label remains caller supplied and unverified. No provider publication,
consent workflow or deployed connector acceptance is implied.

## Verification

- **94 tests in seven suites passed**: core integrity/analytical geometry,
  live comparison, real React field form, in-memory MCP SDK contract, existing
  synthetic computation/export checks and dashboard activity-response handling.
  The old synthetic test title claiming Cap 299 readiness was corrected; its
  numerical assertions were retained.
- `npm run typecheck` passed for app and tests. ESLint passed on the fourteen
  changed TypeScript/TSX paths, including a follow-up check of the final
  engine/print/test changes. `git diff --check` passed.
- `npm run security:gate` passed: 119 applied migration hashes pinned; 737 test
  files and 3,281 source files statically scanned. Those scan counts are not
  counts of executed tests. No applied migration was edited or new migration run.
- Real Chrome/CUA, owned `127.0.0.1:3021` preview: the 100 m north-going synthetic
  open draft displayed unknown misclosure/precision and `NOT ASSESSED`. Adding
  closing N=100.002, E=0 and an explicitly synthetic 3 mm limit displayed
  0.0020 m raw misclosure, 1:50,000 numerical precision and `WITHIN STATED LIMIT`,
  while retaining the draft/unverified notice. Heights were left unentered.
- Local screenshots: `.cache/traverse-integrity/open-draft.png` and
  `stated-limit-draft.png`. A navigation timeout, screenshot/frame timeouts and
  detached UI nodes occurred during preview/hot-reload interaction. The combined
  AX/screenshot check recovered. This is scoped browser evidence; uninterrupted
  editing, full responsive/navigation acceptance, printing and phone behavior
  remain separate requirements. Only disposable QA tabs were closed afterward.
- `npm run docker:verify` passed at turn entry. A final read-only identity check
  confirms the same app container `dd4e758409e4d443c1d9f4e0470ca48131b4b90cdd0cdd5efec7093d887ddc8a`
  and image `sha256:06103336484035d2aad7d3a1d45cf9bb37b8a814507b190108f5ae1586a9d0b0`.
  No production/service/provider lifecycle action was performed. The latest
  verified backup remains archive/header evidence, not a restored recovery test.

## Deployed dashboard activity diagnosis

The authorized production browser session received a flat response with
`activities` and `pagination`; both the nil-project/zero-limit probe and the
ordinary ten-row request returned zero rows. No activity record values were
exported. The deployed dashboard still showed its refresh error.

Read-only inspection of its public client bundle
`app/(dashboard)/dashboard/page-780dd1d4781cf200.js`, SHA-256
`6159ccf5e963991060cedcf2a8e858f812fcdb171d23ce57831c3e5682ed2288`,
shows a schema requiring `data.activities` and assignment from `a.data.activities`.
That disagrees with the actual flat API response. Current source
`ActivityFeed.tsx` already reads the flat response, and its three tests pass.
The next reviewed release must carry that source fix and verify the actual
deployed bundle/browser. No production hot patch or alternate response envelope
was added to conceal artifact drift.

## Required continuation

1. Replace the legacy `/api/scheme/traverse` intake with owner-bound UUID
   admission, an explicit projected metric reference/observation convention,
   retained source/input/result revisions and transactional idempotent receipts.
   Its current schema assumptions, delete/reinsert writes and inferred parcel
   area/status update are not repaired by this numerical checkpoint. Preserve
   earlier observations and require reviewed boundary order; never infer a parcel
   polygon from traverse station order.
2. Connect that retained intake to the scheme UI and reviewed boundary/export
   chain. Test real SQL/HTTP failure, replay, concurrency and lost-acknowledgement
   recovery in the isolated fixture. Do not substitute permanently disabled
   intake or source-only tests for the intended working workflow.
3. Review other traverse runners, instrument reducers, legacy sketch/export and
   optional EDM/correction views separately. This checkpoint does not validate
   their defaults, setup semantics, scale factors, regulatory assertions or
   durable recovery. The separate level-book engine was not changed.
4. Keep the exact public-parcel Cloudflare containment through the reviewed app,
   worker and migration promotion. Resolve clone/migration/recovery and artifact
   alignment gates first; then verify ordinary accounts and deployed widgets.
5. Preserve the signing-key rotation deferral and remaining provider, crew,
   representative large-job, receiving-CAD, paper, independent-surveyor and
   physical-instrument/field gates. The full production/international goal stays
   active; this is a prerequisite, not completion of that goal.
