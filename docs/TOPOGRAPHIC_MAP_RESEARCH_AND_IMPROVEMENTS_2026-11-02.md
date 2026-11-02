# Topographic map: comparison, requirements and implementation

## Findings

The Tools contour generator is not a more accurate alternative engine. Its public generateContours wrapper uses buildConstrainedTIN and generateTINContours. Saved surfaces use buildBreaklineTIN (the same constrained mesh) and generateTINContours, with optional retained terrain-domain clipping and geometry-preserving densification. Equal observations, constraints and contour interval must give equal isolines. A regression now exercises this equivalence.

Tools uses a white SVG plan, brown intermediate contours and heavier index contours, a simpler spot-height display, and local PDF/SVG/CSV/DXF export. Project surfaces use retained immutable observations/reference/constraints, collision-checked plan entities, registered authenticated DXF exports and a CAD-style Konva viewer. Tools file exports do not establish project document-register provenance. Do not replace the saved path with the Tools export path or bypass entitlement.

The published fictional 42-point site has only about two metres of relief and four half-metre contour levels. Tools' sample is a different terrain. More lines or smoother-looking curves cannot establish greater accuracy. Maximum vertex spacing densifies existing straight isolines; it does not smooth or add field evidence.

## Professional requirements

[RICS Measured surveys of land, buildings and utilities, third edition, reissued 2023](https://www.rics.org/content/dam/ricsglobal/documents/standards/measured_surveys_of_land_buildings_and_utilities_3rd_edition_rics.pdf) calls for an agreed purpose, detail and accuracy specification; coordinate/control and height references; selected relevant topographic features; and defined outputs. Relevant detail can include buildings, roads, visible boundaries, water/drainage, utilities, vegetation and earthworks. Selection is project dependent. Its scope is not a blanket Kenya statutory approval.

[USGS Map Symbol Guide](https://www.usgs.gov/ngp-standards-and-specifications/us-topo-map-symbol-guide) supports a clear contour hierarchy: fine brown intermediate contours, heavier labelled index contours, feature-specific symbols, and an explicit contour interval. Its national map scale is not an engineering survey accuracy specification.

Implementation acceptance matrix:

| Requirement | Current evidence / action |
| --- | --- |
| Ground observations, control and datum | Retained XYZ and declared references exist; survey control/checkpoint acceptance still needs real field evidence. |
| Ground selection, breaklines and boundaries | Explicit review and constrained TIN exist; observation hull must never be called a surveyed site/legal boundary. |
| Appropriate interval and accuracy | Interval is selected and retained. Added relief/height summary and clarification that interval is not accuracy. No automatic accuracy claim. |
| Readable drawing | Existing collision placement retained. New paper view, contour hierarchy, full-width fit and preview layer controls implemented. |
| Site feature completeness | Existing feature-coded points and explicitly reviewed breaklines only. Full field-coded connected building/road/drainage linework still needs a reviewed feature-string workflow and independently checked symbols. Never infer connectivity from database order. |
| Deliverables and issue control | Existing exact-revision registered DXF remains. An equivalent registered vector PDF/plot workflow with scale, legend, title/reference block, revision, survey date and reviewer/issue status remains to implement; Tools PDF is not a substitute for retained issue provenance. |
| Independent checks | Added route parity regression; original overlap/retained-source tests remain. Physical receiving-CAD, calibrated print and surveyor/field acceptance remain open. |

## Implemented in this change

- Saved terrain preview opens on white paper with dark annotations, brown contours, stronger index contours and blue reviewed breaklines.
- Paper/CAD view, point labels/leaders and grid controls operate only on the preview; registered exported entities remain complete.
- Project preview uses available panel width and the real Konva container class for centring.
- Recorded height range, relief, saved interval, reviewed domain versus observation hull and accuracy limitations are visible beside the saved revision.
- Maximum segment length is named and explained as geometric densification, not smoothing.
- No terrain calculation, existing revision, coordinate, entitlement, database migration or production service is changed by this source edit.

## Next engineering sequence

1. Agree intended design use, required feature inventory, control/check tolerances and output scale with a practising surveyor; retain this specification with the project.
2. Add reviewed feature strings separate from terrain constraints, with ground/non-ground classification, explicit closure and source order. Include building/kerb/channel/bank/ditch/control symbols only from evidence.
3. Add independently checked field/control completeness and terrain diagnostic reports; keep unmeasured/obscured areas and exclusions visible.
4. Add registered vector PDF using the same saved plan and collision layout, print scale checks and immutable issue/reviewer metadata. Preserve DXF, XYZ and terrain deliverables.
5. Validate one realistic observed site in receiving CAD, at print scale and with an independent surveyor. Then assess larger sites and sheet sets.

This is an implementation milestone, not a complete professional survey acceptance or compliance certificate. Source verification and browser/deployment evidence must be reported separately.

## Verification

- Production baseline: npm run docker:verify passed; required services preserved.
- Four focused suites: 23 tests passed, including identical constrained contour geometry between routes, retained layout, saved revision/export authorization and renderer contrast/visibility.
- All three TypeScript projects passed. Focused ESLint passed with max-warnings 0; git diff --check passed.
- Final palette refactor: two renderer tests re-passed.
- This change is source-only, not committed or deployed. No fresh browser, receiving-CAD, print or field acceptance is claimed. Production still runs 135781c1.

- Follow-up local browser QA: read existing synthetic five-point R1; paper/CAD, independent label/leader/grid controls and Fit passed. Requested 390px viewport measured 380px document/scroll width, with all presentation labels 44px high and no horizontal overflow. No project, point, revision, plan or account was changed. Source preview stopped and next-env.d.ts restored exactly before release admission.
