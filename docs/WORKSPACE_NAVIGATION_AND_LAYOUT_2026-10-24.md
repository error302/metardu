# Workspace navigation and layout acceptance

The owner's current priority is a clear landing-to-dashboard-to-survey flow,
working pages through administration, and layouts whose controls do not cover
each other. This record is a source and loopback browser checkpoint, not a claim
that every page or the advertised production release has passed acceptance.

## Implemented

- Public navigation and the landing hero expose Dashboard while authentication
  loads and after sign-in. Work-mode branding returns to Dashboard. The shared
  header uses grouped navigation before and after session hydration, with a
  reachable menu on narrow subpages and titles in normal layout flow. Language
  selection moves inside the narrow-screen menu to reserve header space.
- Projects is an owner-filtered register with stable 24-item pagination,
  meaningful empty/error states and retry, rather than a redirect to Dashboard.
- Dashboard keeps its optional setup guide collapsed below the main heading;
  duplicate large upgrade prompts are removed. Platform administrators have an
  Administration switch. Dashboard and project shell checks now use the same
  platform-role boundary as `/admin`: `admin` and `super_admin`. Organisation
  administration remains scoped and its badge is labelled ORG ADMIN.
- Offline, update, installation and feedback entry controls use normal page
  flow. Lazy-route loading is contained so it does not cover navigation. The
  installation banner is inside its required language provider.
- The map stylesheet loads from the route entry rather than a lazy client
  chunk. This resolves the repeatable map CSS ChunkLoadError observed in Chrome.
- The narrow fieldbook instrument panel is in page flow. The fieldbook status
  and tabs no longer share competing sticky offsets. Book-name and save controls
  remain accessible; capture, observations and storage were not reset.
- Overview aggregate SQL binds the admitted owner immediately before reading.
  The browser reproduced zero summary points beside five loaded map points;
  after the fix both report five. Activity now parses the actual unwrapped
  `/api/activity` response instead of rejecting successful responses.
- Dead Help API-documentation and project-register links are corrected.
  Unpublished installer/verifier downloads and an absent reference PDF no
  longer pretend to be downloadable files.

## Source checks

`scripts/check-navigation-routes.mjs` checks literal local hrefs against existing
App Router pages and public assets. Current inventory: 237 page files, 819 static
page links, no unmatched references. It does not execute routes, interpolate
dynamic hrefs, authenticate users, inspect layouts or prove feature behavior.

The current focused UI/fieldbook command uses `--runTestsByPath` so the literal
dashboard path is included: 106 tests in 19 suites pass. Receipt:
`.cache/workspace-ui/final-tests.json`. The retained 473-test server/civil/mobile
baseline is recorded separately; these counts must not be added without
deduplicating suites. Scoped ESLint and the repository security/bug gate pass;
the latter pins 119 applied migrations and scans 706 test files / 3221 source
files. Both app and test type checks pass after the final edits. The final
language/header follow-up passes nine tests in two suites
(`.cache/workspace-ui/header-tests.json`). This checkpoint spans 24-25 October.

## Actual Chrome observations

Owned source preview: `http://127.0.0.1:3021`, existing host process and isolated
synthetic database. Existing free surveyor account and synthetic topographic
project only. No new admin role, subscription, entitlement, payment or field
evidence fixture was introduced for this audit.

| Page / flow | Observed result |
| --- | --- |
| Landing to Dashboard | Visible Dashboard control opens the signed-in dashboard. |
| Dashboard | Heading, optional guide, project totals and project entry render. Activity now shows its real successful empty state instead of a parsing error. |
| Projects | Own synthetic project renders with five points; no redirect back to Dashboard. |
| Reports | Page renders in the narrow window. |
| Map | Full map and controls render after the stylesheet fix; no grid is invented. |
| Fieldbook | Book-name/save controls are not covered by instrument capture. Read failure is visible and Retry account & projects recovers the owned project list. No book changes or instrument connection performed. |
| Toolbox | Tool catalogue, category controls and search render. Paid tools retain their real plan boundary. |
| Account | Profile, password, subscription and billing sections render. No credential, billing or account changes performed. |
| Project Overview | Declared EPSG:21037 and synthetic height-reference label render. Summary and map agree on five points and one observation batch. |
| Privileged administration | Pending existing administrator sign-in by the owner. The observed session is still the ordinary surveyor. Denial is not successful privileged-page proof. |

Actual viewport widths observed were approximately 628 and 1270 CSS pixels.
At 628, Projects and Account have zero document horizontal overflow; Projects
header geometry has no intersecting visible controls. Fieldbook also has zero
document horizontal overflow. This does not certify 320-pixel phones, hardware
keyboards, accessibility, zoom, every breakpoint or all 237 runtime pages.

Local screenshot: `.cache/workspace-ui/project-overview.png`. Browser screenshots
are synthetic software evidence; the CAD training drawing and browser storage
were not edited through automation internals.

## Still required

Finish privileged `/admin`, customer directory and payment-ledger rendering
with the owner's existing account. Continue the dynamic project stages and
remaining page families, including loading/error states and narrow layouts.
Keep the route-by-route distinction between source existence, rendered page,
read data and actual feature acceptance. A source-preview compilation delay
does not by itself prove a production load failure.

Production is unchanged. Worker artifact drift, migration/recovery compatibility,
rollback and coherent promotion, the owner's signing-key deferral, payment
provider acceptance, receiving CAD and physical surveyor/field acceptance remain
separate open gates in `PRODUCTION_READINESS_EXECUTION.md`.

## 25 October stage follow-up

The seven project stages now have actual Chrome rendering observations at 1270
CSS pixels. Control shows the empty control register with review required;
Observe loads the retained coordinate-import batch and hash; Compute shows its
saved-traverse inputs requirement; Design does not invent a computed boundary;
Verify and Deliver render their actual data panels. None has document horizontal
overflow in this observation. The read-only stage receipt is
`.cache/workspace-ui/browser-stages.json`; hidden responsive DOM copies are
included in some heading metadata, while visible content was checked with CUA
accessibility snapshots.

That audit found and repaired another real contract mismatch: the Verify panel
expected `{ data: { events } }`, but its endpoint returns `{ events }`. It now
validates the actual response, project identity, dates and displayed hashes.
Loading/unavailable evidence has no invented zero count or empty-ledger claim.
Failed refreshes preserve the last loaded events and expose retry. Project
changes and unmounts abort reads; late events cannot replace another project's
view. Displaying linked hashes does not itself verify their chain or establish
professional approval.

The Deliver register now validates its existing enveloped response and project
identity, distinguishes loading/failure from an empty successful read, preserves
confirmed records on failure, exposes retry and leaves approval unconfirmed
while the register is unavailable. A project switch hides old records and
aborts their request. Product error text no longer tells customers to run
database migrations. Read-state regressions pass 13 tests in two suites:
`.cache/workspace-ui/stage-read-tests.json`. Type checking passes after these
changes; scoped lint passes after removing two existing unused icon imports.
The combined UI/fieldbook checkpoint passes 119 tests in 21 suites
(`.cache/workspace-ui/complete-ui-tests.json`). The security/bug gate also passes
with 119 migration pins, 708 test files and 3223 source files scanned.

The topographic workspace also renders its retained ground table, boundary /
breakline controls and saved-revision selector. Choosing existing revision
`6305f3af-6c96-4537-9009-e6e7fcd8cbac` loads its exact hash, five source points,
three contour levels and 240 m2 reviewed footprint with eight derived clip
vertices. `.cache/workspace-ui/retained-terrain.png` shows the actual drawing.
No observations, boundary definition, review confirmation or saved drawing were
changed. New boundary creation, paid export and receiving-CAD acceptance remain
separate from this saved-revision read/render proof.
