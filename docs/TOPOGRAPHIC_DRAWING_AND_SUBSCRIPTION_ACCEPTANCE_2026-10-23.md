# Topographic drawing and subscription acceptance

Source-only follow-through, 23 October 2026. This extends
`TOPOGRAPHIC_SOURCE_ACCEPTANCE_2026-10-23.md`; it does not certify a production
release, instrument workflow, receiving CAD application or payment lifecycle.

## Authorized fixture and restoration

The owner explicitly approved the previously rejected temporary Pro fixture for
synthetic account `99f15c47-7a36-43c4-b98c-1171da777039`. The inspected helper
verified the exact labelled rehearsal service ID, loopback port 55433, database
marker, account/email, owned project and absence of an existing subscription.
It inserted only generated subscription
`d685e879-2e4c-4ce6-a479-6bc823cdcd47`, with one-hour expiry and payment method
`synthetic_acceptance_no_payment`. It did not change the ordinary user role or
contact a provider. This fixture represents application state, not payment proof.

After drawing checks, the helper removed that exact fixture and verified the
original zero-subscription state, unchanged ordinary role and unchanged
fingerprint of all other subscriptions. A fresh normal HTTP sign-in then read
`plan=free`, `isAdmin=false`. Read-only database inspection reconfirmed the five
original XYZ points and declared reference. The owner-approved temporary access
cycle is **finished**; it is not awaiting approval or left enabled.

The earlier automatic approval rejection was respected until the owner's
specific approval arrived. The later approved seed/restore both executed
successfully. No production subscription, provider, customer account or migration
was changed. The independent capture QA account was only used for normal
authenticated read checks; the earlier revoked account was not reactivated.

## Paid-access defect reproduced and repaired

The fixture initially existed in PostgreSQL, while both the actual browser and
ordinary HTTP `/api/subscription` returned free access. The subscription route
queried row-secured tables without binding the authenticated owner's database
context. The usage-count and owner-cancellation routes had the same omission.
Three source regressions reproduced the resulting failures before repair.

The GET subscription, POST cancellation and GET project-count paths now use the
existing `setAuthenticatedDatabaseContext` authority before database queries,
after the relevant awaits. They retain existing owner predicates and refuse
client-supplied plan-upgrade actions. This is an authenticated owner context,
not an admin or provider service role. No RLS policy was weakened.

Evidence after repair:

- Normal native HTTP authentication for the exact fixture returned Pro,
  `isAdmin=false` and its synthetic payment method. The browser then admitted
  the ordinary account to the drawing route and loaded all five saved points.
- Six concurrent rounds across the ordinary Pro fixture and an existing
  ordinary free fixture completed 24 subscription/usage reads. Pro stayed Pro,
  free stayed free, and each reported its one owned project. Opposite-account
  query parameters did not change which identity was read.
- Five focused route regressions cover authenticated context before SQL,
  ordinary project count, owner cancellation context, anonymous refusal and
  continued refusal of direct plan upgrades. Cancellation binding is source
  evidence; an actual provider cancellation lifecycle was not exercised.
- The final normal HTTP read after fixture restoration returned free access.

The native before/after and concurrent-read receipts are retained under
`.cache/topographic/`. Login credentials are deliberately omitted here.

## Browser drawing and original file checks

The admitted browser loaded project
`474f92f6-0e90-4129-83fb-d514db596876`, its five saved points, explicit
EPSG:21037/local-height reference, unknown `SPOT` feature codes, and three
contours at -1, 0 and +1. Project coordinates were read only in this view.

Independent inspection of the first downloaded DXF exposed flattened point
geometry: measured heights -2 and +2 were encoded as POINT Z=0. The file is
retained as `drawing-default.dxf` as failed pre-repair evidence. The shared
entity model now carries each measured point height. The DXF adapter supplies
the native point writer's standard group-30 ordinate without replacing its
handles/entity ownership. Zero heights remain zero; missing source heights are
still unknown and block this drawing workflow's terrain/export.

The browser preview also cropped the title/reference notes. Its viewport now
responds to its actual container width and fits the complete rendered scene,
including annotations outside the neatline. Neatline clipping and source survey
coordinates remain unchanged. Inspection further exposed grid ticks generated
below the first in-frame grid coordinate; these enlarged invisible bounds and
also escaped the DXF frame. Grid generation now begins at the first in-frame
coordinate and keeps tick endpoints within the frame. Invalid/nonpositive and
excessively dense grid intervals produce an editable error and block export,
without losing observations or silently truncating ticks. Those invalid-setting
paths have source regressions; the late grid-admission UI repair was not
rechecked in a live browser after debugger detachment.

Two actual browser exports after the XYZ/grid-bound repair are retained:

- `drawing-measured.dxf`: decorative title block enabled.
- `drawing-without-title.dxf`: title block disabled through the ordinary UI.

`scripts/verify-topographic-drawing-files.py`, using normal ezdxf with the
existing native verifier packages, passed both files without audit errors or
repairs. It establishes:

- Exactly the five independently specified source XYZ points, including -2, 0
  and +2, in metre units and AC1021 DXF.
- Exactly three open elevated contours with independently specified endpoints
  and every vertex on the known plane
  `z=-2+0.1*(E-500000)+0.1*(N-9850000)`.
- Four grid ticks contained within the independently known padded frame.
- Explicit EPSG/local-height reference and draft labels in both files, including
  the title-hidden variant. No guessed Arc zone or fixed country heading.
- Unmapped `SPOT` points remain on `OTHER-UNKNOWN`; no surveyed feature
  classification was invented. Their source codes remain in the retained input.

SHA-256 hashes and normal-parser results are in
`test-results/topographic-source-acceptance/drawing-native-verification.json`.
The original clipped preview and corrected fit screenshot are retained there.
Visible fit is not a physical print-scale or label-clearance acceptance result.
These draft downloads are not registered deliverables or approval receipts.

## Account display follow-through

The account page also rejected a valid Pro response because `trialEndsAt=null`
failed its response schema. Its error path then displayed “No active
subscription.” The source now accepts nullable trial/period fields, shows
loading/read-error/retry states, cancels stale responses, and keys private
account state by identity. It no longer invents a period end thirty days in the
future or describes an unverified automatic renewal. Payment history points to
the existing billing-record page instead of always asserting an empty history.

Three component checks cover a normal paid response with a null trial date,
visible read failure and late-response isolation across account changes.
Browser control detached during the final fresh account-page attempt. The
account-display repair has source/component evidence; its fresh browser check
and the post-restoration free drawing-gate reload remain open. The original
pre-fixture free gate and the positive paid drawing admission were verified.

## Verification and remaining work

The final combined run passed **60 tests across six suites**: 10 workflow,
8 drawing UI, 23 drawing-source, 11 drawing-entity, 5 subscription-route and
3 account UI checks. Both strict TypeScript projects, scoped lint and
tracked-file whitespace checks passed.

Fresh `npm run docker:verify` passed before the approved fixture: one app,
required services and HTTP/database/Redis health, with migration-image
agreement. Backup receipt `2026-10-23T10:25:43Z` remains archive/header evidence,
not restored recovery. The existing source preview was reused; no service was
built/restarted/promoted, and no applied migration was modified.

Continue the full production goal. Remaining work includes revision-bound
surface/drawing/deliverable linkage, browser upload permission, authenticated
workflow persistence/mobile checks, receiving CAD and physical print review,
independent control/instruments/offline field acceptance, actual payment
lifecycle, recovery/security and the final reviewed production candidate. The
owner's signing-key rotation deferral remains intact. No claim of international
jurisdictional acceptance follows from the source's registered CRS support.
