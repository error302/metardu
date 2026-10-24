# LandXML and map handoff integrity — 24 October 2026

This source milestone repairs the shared point writer and the global-map LandXML
handoff. It also fixes a reproduced double transformation of map circles in DXF.
It does not promote source, certify a survey or prove receiving-CAD acceptance.

## Reproduced defects

The old shared LandXML file failed validation against the official LandXML 1.2
XSD: `Header` is not a LandXML child. Inspection of that schema also showed that
Units belongs at the root; the invented nested Datum, Projection and VerticalDatum
elements and CgPoint `featureCode` attribute were not the schema-defined form.
Tests that asserted those invented elements were therefore inadequate evidence.

Independent regression tests reproduced unknown heights becoming numeric zero,
NaN/infinite coordinates being emitted, and blank/duplicate point names passing
unchecked. The GIS page independently converted absent height to zero before
calling the writer. A duplicate-name component test exposed an uncaught error
when a strict writer refused the request.

The map's old export loop retained only the outer ring of Polygon, skipped multi
geometries and collections, and silently skipped transform failures. A mixed
15-coordinate fixture exported only five coordinates. A circle alongside a point
was silently omitted while the remaining point was downloaded.

The DXF circle test previously checked count and closure only. Checking a known
coordinate reproduced the error: one `[100,-50]` translation was applied twice,
yielding `[215,-80]` instead of `[115,-30]` at the first vertex.

## Resulting behavior

- The existing `generateLandXML` import remains the shared entry point. Its writer
  uses root Units, Application, Project, CoordinateSystem attributes and standard
  Feature/Property extensions. It no longer fabricates a SurveyHeader or surveyor.
  CRS/ellipsoid/height provenance remains machine-readable using schema-supported
  attributes and extension properties. Source metadata cannot override the
  authoritative grid or vertical provenance.
- Unknown height is emitted as a two-ordinate northing/easting CgPoint. A measured
  zero or negative height remains a third ordinate. Coordinates retain JavaScript
  numeric precision instead of being rounded to four decimal places. Nonfinite
  coordinates/heights, invalid projected ranges, blank or duplicate names,
  illegal XML characters and unresolved plan references refuse the whole export.
- The GIS page retains null heights and displays synchronous export refusal in an
  alert without creating a file or marking that attempt downloaded. Its LandXML
  card describes coordinate exchange rather than claiming ISO-standard status.
- Map handoff retains all supported Point/MultiPoint, Line/MultiLine,
  Polygon/MultiPolygon rings and nested GeometryCollection members. Unique output
  point names avoid collisions from duplicate labels or original source IDs.
  Lines and every polygon ring become PlanFeatures with resolvable point
  references. Explicit metadata identifies outer/hole roles and source paths.
  These are plan drawings, not automatically established legal parcels.
- The source feature, its ID and properties are retained once per feature using
  schema extension metadata. Each point retains its original source coordinate
  and path. Original extra ordinates remain metadata; a three-ordinate source
  position retains Z as an unverified source value. The map does not relabel that
  value as surveyed RL merely because the project has a vertical declaration.
- Unsupported display circles refuse the entire LandXML handoff with a visible
  error; the map source remains intact. No supported geometry is silently skipped.
  The Set Out panel now labels this action **Export map drawing (LandXML)**.
  Actual design/set-out acceptance remains with the project set-out workflow.
- DXF display-circle tessellation now transforms each vertex once. The existing
  64-segment approximation remains a display-drawing handoff, not a survey-circle
  measurement or an exact analytic CAD circle.

## Verification and reproducibility

Focused source regression coverage: **eight suites / 49 tests passed**, including
real OpenLayers geometry, hook downloads, the actual shared writer, ordinary XML
re-import and the GIS page's download/refusal behavior. Commercial/authentication
adapters in component tests are bounded mocks; these tests do not establish live
entitlement enforcement or ordinary-account browser acceptance of this export.

`node scripts/verify-landxml-fixtures.mjs` generated four clearly synthetic
artifacts, recorded source hashes, checked known values and re-imported the
coordinates. Three point files cover WGS84 37S, WGS84 32N and Arc 1960 37S,
including absent, zero and negative height. The complete map file contains
**26 coordinates and six PlanFeatures**, with polygon-hole and collection
provenance. The fixture input remains unchanged. No database, browser state,
credential or production service is accessed by this generator.

`scripts/verify-landxml-schema.ps1` validates using .NET's independent XML Schema
engine and the official LandXML 1.2 XSD. DTD resolution, external resolvers and
document-provided schema loading are disabled. All four files passed with zero
schema issues. The old file was retained locally and failed the same validator.
Schema validation proves structural compatibility, not acceptance by Civil 3D,
12d, a regulator or an instrument.

Reference XSD: [LandXML 1.2 schema](http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd).
The retrieved public schema is pinned by SHA-256
`f4f732341970a923943f94592a3fde0838534515d564a699761e85420fad4d77`.
It is reference data in `.cache/map-export/LandXML-1.2.xsd`, not bundled executable
code or a runtime network dependency. To reproduce, retrieve that exact reference,
verify the hash, generate the fixtures, then pass their paths as `-XmlPath` to the
PowerShell verifier. The verifier refuses a different schema hash.

Autodesk's [supported LandXML data documentation](https://help.autodesk.com/cloudhelp/2022/ENU/Civil3D-UserGuide/files/GUID-4D10ABA5-5EA0-41A8-BB61-C3F446CE7C6B.htm)
describes CgPoints and PlanFeatures/CoordGeom import. This is format context;
METARDU's actual output has not been tested in a receiving CAD application's UI.

Local receipts: `.cache/map-export/jest.json`, `fixtures.json`,
`schema-result.json`, `eslint-final.json`, `before.xml`, and the four generated
XML artifacts. A full app/test type check, scoped lint and the security/migration
gate must be recorded at the commit boundary. A transient registry lookup for an
uninstalled `tsx` launcher failed; no package was installed. The artifact verifier
uses the existing TypeScript compiler and Node runtime instead.

## Source, live and external work still open

| Boundary | Remaining work |
| --- | --- |
| Other source exports | KML/WKT completeness and display-circle handling; GIS CSV/KML helpers still coerce some unknown heights, and GIS asynchronous DXF/ZIP requests need response-status/error acceptance before a success badge. |
| Legacy civil surface path | `civilHandoff.exportLandXMLSurface` writes point indexes in PntList3D, omits required Metric fields and has no retained TIN face definition. Its advertised surface/design/volume workflow needs a real surface handoff repair and independent artifact proof. This milestone does not certify that separate function. |
| Geometry meaning | PlanFeature hole-role metadata retains the drawing; a receiving program may not recreate a legal parcel/hole relationship automatically. Imported Z and circles need explicit source/height/geometry evidence before design use. |
| Browser/receiver | This milestone has hook/component download proof and independently validated artifacts. Ordinary-account UI downloads, receiving CAD import and physical printing remain separate acceptance tasks. The previous saved-map browser rehearsal proves save/recovery, not this new export. |
| Live release | Source is not promoted. Runtime health passed against the one existing production stack, whose source identity is not thereby established. Review concurrent source, migration compatibility, recovery evidence and rollback before a single coordinated promotion. |
| Provider/field | Paid lifecycle/webhooks, email inbox delivery, restored-backup recovery, instruments/control, licensed-surveyor review and the user's deferred signing-key rotation remain open as previously documented. Computer-browser-only testing and ChatGPT notice/deployment/human-consent gates remain in force. |

No customer data, applied migration hash, container, signing key, DNS or service
configuration is changed by this milestone. See
`MAP_DRAWING_WORKFLOW_INTEGRITY_2026-10-24.md` and `CREDIBILITY_ACCEPTANCE.md` for
adjacent evidence and the broader active production-readiness goal.
