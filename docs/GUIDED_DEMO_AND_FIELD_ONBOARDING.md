# Guided demo and field onboarding

Source verification checkpoint · 28 November 2026

## Visitor onboarding

- The homepage leads with the public guided survey and uses a capture from
  the actual sample-plan review interface. The demo uses the shared METARDU
  navigation, logo, theme, and locally hosted typefaces.
- The sample follows a closed five-beacon traverse through control, field-book
  review, linear closure, Bowditch adjustment, and handoff. It retains both
  closing readings for comparison and requires a passing linear check before
  showing adjusted output. Independent angle observations and elevations are
  outside this exercise.
- Chrome and the 390 px in-app browser completed the guided sequence. The
  homepage image loaded and the phone layout fit without horizontal overflow.
  The downloaded A4 PDF, DXF, and CSV were inspected. All three contain the
  same five adjusted coordinates. The DXF has a closed boundary and metre
  units, and the PDF labels the 1:2,000 print scale.
- Pricing remains linked from the homepage and available on /pricing. The
  dashboard keeps the existing project-limit upgrade entry. The project
  creation form offers a plan link after the server returns its quota code.
  The dashboard trial reminder begins in the last three days.

## Field collector

- The collector uses one phone action bar for Measure, Set out, Points, and
  Sync. Project and station share a header, and Measure has a full-width touch
  target. Set out opens the existing project workflow.
- The owned source preview served the collector sign-in page. Its synthetic
  database health check returned 503, so an authenticated browser capture
  session was unavailable. An inventory check confirmed that the old synthetic
  database and its test role are absent from the current rehearsal service.
  The focused component tests cover measurement
  controls and Set out behavior. Field acceptance still needs a supported
  instrument and a real phone. Run a setup and control check, capture points in
  sunlight, confirm device persistence across reload, reconnect, and verify
  server receipts and the resulting office export.

The phone workspace now has a fixed Collect, Set out, Map and Schedule dock.
More holds the field book, equipment tracker, marketplace, beacon registry and
a short list of field calculators. The phone dashboard opens field jobs, and
Set out accepts a project selection directly. The main office toolbox and
document workflow remain available through the laptop workspace.

## International scope

- Prioritise topographic and engineering teams that need field collection,
  traverse, levelling, and CAD handoff. The source supports registered WGS 84
  UTM grids and several country profiles. Country-specific cadastral filings
  need local requirements, verified transformations and vertical datums, and
  sample datasets reviewed by a local surveyor.
- Use a non-Kenyan pilot job with known control and a reference export. Check
  grid and units across capture and export, then verify the buyer's checkout
  route. Published currencies alone do not prove that payments settle in
  every market.

## Map viewport regression

- The live desktop map had a 121 px header stack, including a 56 px update
  banner. The page extended 121 px beyond the viewport and placed the
  coordinate strip and attribution below the fold. The source preview also
  overflowed beneath its 65 px navigation bar with the banner absent.
- The map now fills the space available below the actual header stack. The
  phone layout reserves room for its fixed navigation dock. Browser checks
  found no page overflow at 1280 × 575 or 390 × 844, and the coordinate strip
  and attribution stayed in view with the phone tool dock open.
- The screenshot showed a satellite basemap at a 1,000 m scale-bar reading.
  The live check opened on a street basemap with a 50 m reading. The viewport
  fix leaves the saved basemap, camera, survey grid and drawings alone.
- The standalone legend was removed. Print is back in the right-hand map
  controls and uses the existing PDF export. The restored button downloaded
  a one-page landscape PDF with the current map and source credits. At
  390 px the button was visible and measured 44 × 44 px.

## Release status

The existing production stack passed the read-only Docker runtime check. The
132 source migration checksums matched the production ledger. The current
backup status verifies an archive and its headers. The working-tree restore
producer expects 131 migrations before replaying migration 127. Production
already has 132, including 127, and the existing restore authorization belongs
to a different source. This UI release needs a verified application-only
promotion path for the current schema. The public /demo still returns the
previous field-book screen.
