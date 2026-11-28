# METARDU first-project and platform audit

28 November 2026 · Africa/Nairobi

## Decision

Make the first complete survey the Free plan promise. The recommended first
workflow is a small topographic or engineering site with known control and
supported file or manual observations. Its completion is a reviewable PDF plan,
coordinate CSV and a recoverable copy of the original observations. Start with
this workflow before advertising jurisdiction-specific cadastral filing or
instrument compatibility. The verified sign-off belongs to the surveyor.

## First project on Free

| Step | What exists | What needs to change |
| --- | --- | --- |
| Sign up | Public pricing advertises one survey project, up to 50 survey points, a basic watermarked PDF and CSV import. Public signup promotes a trial. Account onboarding automatically assigns 14 days of Pro, with expiry resolving to Free. | Explain the permanent Free allowance and trial-only features before the user starts. Prove the journey on an ordinary Free account with an expired trial or no trial. |
| Set up | The creation API checks the plan inside a transaction and serializes concurrent creates for the same owner. Project reference validation prevents inconsistent datum, zone and hemisphere. | Give the first-project wizard a working CRS, vertical reference when applicable, control source, and one visible next action. Keep advanced settings available in the project. |
| Capture or import | The browser has project-scoped field collection and offline observation storage. The source also has multiple field entry points. The advertised 50-point limit exists in tier definitions. The subscription usage reader returns an empty point-usage map. | Choose one collection and import path for the guided project. Align the point allowance and metering with the plan. If retaining a limit, disclose it at setup. Keep accepted raw readings and recovery/export available when a limit or trial expiry is reached. |
| Check and review | A project stage registry covers control, observation, computation, design, verification and delivery. Retained-data checks exist for specific workflows. | Make the default sequence Setup → Observe → Check → Deliver. Put tolerance source, measured value, missing evidence and next action together. Show the optional design stage for jobs that need it. |
| Deliver | The project export API admits CSV and GeoJSON without a format-based paid entitlement, subject to project ownership and reference checks. DXF and LandXML require a paid feature. The Deliver screen shows all four formats and gives a generic alert when one fails. The screen also links to a Pro-gated plan viewer. | Put the verified Free PDF and CSV first. Display paid formats with clear eligibility before a user clicks, and keep the server response visible in context. Verify a single Free PDF path from the actual project; the catalog promise and map-PDF shortcut alone do not establish it. |

Create the first package and let the surveyor reopen it before showing a project
upgrade. A second project, paid exports, larger processing limits and team
features are distinct reasons to upgrade. Make any costs or limits visible in
the plan details and in the workflow before the user relies on a paid feature.

## Survey standard and record integrity

- **Preserve original observations.** The collector's point list calls a
  local IndexedDB delete and suppresses errors. It provides neither a reason
  nor a supersession record on that path. Take that action out of the survey
  record flow until it can flag or supersede a reading with operator, reason,
  revision and sync receipt. Kenya's survey regulations call for traceable
  field notes and retention of the original entry when it is corrected.
  [Survey Regulations, regulations 69 and 71–74](https://new.kenyalaw.org/akn/ke/act/ln/1994/168/eng%402022-12-31/source)
- **Use the job's actual tolerance.** The shared traverse engine labels a
  general 1:5,000 cadastral threshold as a Kenyan minimum and cites regulation
  97 in its source comments. Regulation 97 concerns plan certificates. The
  lower-order traverse rules depend on traverse order and datum. Treat the
  general threshold as a screening value and require an adopted criterion with
  an applicable citation before using a pass for a professional workflow.
  [Survey Regulations, regulations 60–67, 81–82 and 97](https://new.kenyalaw.org/akn/ke/act/ln/1994/168/eng%402022-12-31/source)
- **Keep survey, approval and filing states explicit.** Preserve units,
  horizontal and vertical reference, control, observations, corrections,
  calculation method and result, independent check, reviewer and output
  revision. Use separate labels for Draft, Reviewed, Issued and Filed. For
  Kenyan work under the Survey Act, the plans, field notes and computations
  form part of the formal record, and authentication is a separate act.
  [Survey Act, sections 30–32](https://new.kenyalaw.org/akn/ke/act/1961/25/eng%402020-03-18/source)

## What each platform should show

| Surface | Primary job | Show first | Evidence boundary |
| --- | --- | --- | --- |
| METARDU Field on a phone | Open a prepared job, record observations, set out approved targets, and hand off the field record. | Jobs, Measure, Set out, Sync. Inside Measure, show point ID, code, instrument and fix state, one large action, and the last saved point. Use a point log and a lightweight map on demand. | Start with manual notes, files and supported device tests. Label phone position as approximate. Enable hardware-specific measurements and stakeout after the exact device, transport, instrument model, firmware, working mode and project tolerances pass. A Home Screen web app and a native Android collector have different support boundaries. |
| METARDU Web on a laptop | Coordinate the project and finish a standard survey. | Project setup, import, control and QA, map, reviewed documents and delivery history. Keep search and the advanced toolbox secondary to opening or resuming the job. | Browser installation uses the web app. Large input bounds, offline behavior and outputs depend on the workflow. The first Free package should finish here without installing Desktop. |
| METARDU Desktop | Process larger or locally held data and perform office drafting. | Local projects, bulk imports, heavy terrain and point-cloud tools, advanced CAD and sheets, backups and exchange. | The current checkout has the Electron shell, Rust sidecar and source workflows for local bundles and office processing. This audit did not run a packaged build or establish Desktop-to-Web automatic synchronization. Ship each advertised native feature against its installed-build and file round-trip evidence. |

Keep one logo, vocabulary and project identity. The phone uses the same dark
and copper theme with an outdoor contrast mode, fewer controls and larger tap
targets. Put the job, station or control, source/fix and storage status where
the operator can see them on every capture. Show Saved on device, Pending
delivery, Delivered or Needs review with a specific action. Make CAD, surface
editing and formal documents resumable on the appropriate office surface.
The phone should send the evidence the office needs and provide a usable field
backup. The instrument, device and software combination determines which
measure and setout commands are available.
[Trimble Access field workflow](https://help.fieldsystems.trimble.com/trimble-access/2023.00/en/Get-started.htm)

## Acceptance before making the commercial promise

1. Run a 15–30 point measured job as a non-admin Free user, with no active
   trial. Register, declare the job reference, check known control, capture
   or import, recover originals, resolve a deliberately failed check, review,
   and download the promised files. Repeat the final checks after trial expiry
   and confirm that a new project, rather than access to existing evidence,
   is what reaches the project limit.
2. On one named Android device and one supported receiver or total station,
   verify outdoor readability, save a point offline, interrupt and resume,
   reobserve a point, reconnect and match each durable sync receipt. Verify
   an approved setout target against independent control. Test iPhone manual
   capture and web-app offline behavior separately before making those claims.
3. Open the same exports independently. Compare CRS, units, coordinates,
   heights and geometry against known values, print at original scale, and
   have a surveyor review the record and package. For Desktop, verify one
   published native build on a large reference job and demonstrate a supported
   backup/restore and exchange path.

## Trial abuse follow-up

Product decision: keep the 14-day Pro trial, then apply Free entitlements
unless the customer subscribes. Existing work and its Free exports remain
available. The expiry boundary should affect new Pro operations.

The credentials signup route limits registration attempts and normalizes
email. Completion limits requests per account and uses a per-user conflict
check, which preserves the original expiry on retries for that account. The
subscription engine evaluates expiry before returning the effective plan.
The current onboarding order grants Pro before email verification.

- Verify ownership before starting the trial clock, including trusted verified
  identity claims for sign-in providers that supply them. Start the clock once
  using server time.
- Record a durable grant against the verified identity. Test concurrent
  requests, sign-in through another provider, and account recreation against
  the same grant. Apply provider-specific identity rules only where verified.
- Verify that production uses the shared limiter and trusted client identity.
  Combine signup and verification throttles with usage caps on the costly Pro
  operations. Use network patterns as a review signal, since survey crews
  can legitimately share a connection.
- Test entitlement at expiry on project creation and paid exports. Check that
  originals, existing projects and Free outputs remain available. Monitor
  repeat grants, signup bursts and unusually intensive trial usage before
  imposing more signup friction.

## Evidence from this audit

- Public pricing, signup and installation pages returned HTTP 200. The public
  pages showed the Free project and trial messages described above.
- Six focused suites passed 49 tests covering creation transaction handling,
  reference-bound export, deliverable-register states, field session behavior,
  surface export entitlement, and numerical/readiness checks.
- An earlier continuous synthetic journey retained observation and boundary
  revisions and independently validated actual DXF and GeoJSON files. Its
  entitlement and authentication adapters did not establish an ordinary
  Free account's journey. The current owned browser preview lacks its old
  synthetic DB, so this audit did not open an authenticated project in it.
  [Retained survey journey evidence](RETAINED_SURVEY_JOURNEY_ACCEPTANCE_2026-10-26.md)
- Desktop source inspected at cbc5344 in metardu-desktop. No customer data,
  plans, releases or checkout rules were changed in this audit.

## Trial implementation checkpoint

- A supported verified sign-in, email confirmation, or password reset can
  start one 14-day trial per verified email identity. Existing subscriptions
  and trial end dates carry forward. When the trial expires, paid tool access
  ends and the account uses Free entitlements.
- The account setup routes share Redis request counters in production. During
  the trial, a verified identity can request up to 20 covered paid exports
  per UTC day. The cap applies to new exports. Existing projects and saved
  deliverables retain their existing access rules.
- The isolated PostgreSQL rehearsal verified activation, expiry, the export
  cap, and a denied repeat grant after account recreation. The production
  promotion still requires recovery evidence covering migration 128 on the
  approved backup archives.
