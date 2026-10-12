# Current source presentation review — 11 October 2026

## Subsequent repairs promoted and browser verified

The measured login/map target gaps below are repaired in the next source batch.
`test-results/tin-mobile-source-browser/` contains fresh 390×844 captures and DOM
measurements: Forgot password and Remember me are 44 px; all six secondary map
controls are at least 44 px; the north arrow appears after asynchronous map
initialization; the 44×44 offline button stays inside the map above navigation.
The contour calculation visibly completes in its background worker. The new
ChatGPT notice page and homepage announcement are verified in the source browser.
Promoted-production Chrome now confirms the same login/map target measurements
and background worker execution. The new notice shows its exact publication and
30-day eligibility times. See NOTICE_WORKER_VERIFICATION_2026-10-11.md and
`test-results/notice-worker-release/completion.json`. Physical-device proof remains
separate.

## Historical review before those repairs

CUA inspected the owned `http://127.0.0.1:3021` source preview. The customer
Docker app, browser protections and localhost CAD training drawing were preserved.
The source database is separate from production. These are browser viewport checks,
not physical mobile-device proof.

- Login has no separate enclosing card, uses the shared canonical icon, and fits
  390 × 844 with equal 390 px client/scroll widths. Email/password inputs are 50 px,
  password visibility is 44 px and Sign In is 52 px. The Remember me label and
  Forgot password control need larger mobile hit areas; the latter measured 20 px.
- Landing images load, the shared navbar appears after hydration, and the content
  labels its sample as synthetic and generated outputs as drafts.
- Footer links render at 44 px with plain legal labels and the professional-review
  notice. Logo consistency is rendered evidence; provider sign-in is not tested.
- Marketplace reaches the actual **No listings yet** state in the marked synthetic
  source database. Its public API excludes the exact retired seed-title allowlist
  and refuses to treat the legacy verified boolean as verification evidence.
  This is not an audit of customer inventory; no inventory was deleted.
- Mobile map has a 65 px top navbar, a 716 px map starting at y=65, and primary
  navigation at y=790. Client/scroll widths both measure 380 px. Main category
  tools are 48 px and primary navigation links are 53 px. Secondary zoom/grid/print
  controls measured 36 px and the offline-map control 40 px: actionable next fixes.
- Existing fresh contour proof confirms four 44 px downloads, distinct More and
  primary destinations, Escape close and focus restoration.

Evidence: `test-results/workflow-presentation/`. Screenshot capture timed out on
some pages; the saved login mobile image, landing desktop image and marketplace
desktop image are actual captures. Map geometry is DOM/AX proof; a map screenshot
was not obtained in this review. The temporary mobile viewport was reset.

Keep the candidate build's source association intact. Repair and browser-verify
the remaining mobile targets in an explicit subsequent source batch, or invalidate
and rebuild the reusable candidate before including them in this promotion.
