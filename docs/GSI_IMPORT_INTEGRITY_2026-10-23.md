# GSI measurement and target-point integrity

Date: 23 October 2026. Source integration only; no production promotion,
instrument connection, customer import or field certification occurred.

## Correct measurement meaning

The parser previously interpreted all observation angles as decimal degrees
and all observation lengths/heights as millimetres. The adapter guessed an
instrument station from the first coordinate and automatically paired faces
without established setup context. Station-coordinate words could overwrite
target coordinates or enter the target-point import path.

The repair follows the word units rather than an assumed measurement scale:
gon and packed sexagesimal angles become decimal degrees; metric length flags
retain their declared precision. Foot words require an explicit international
or US survey foot definition. Invalid payloads, unsupported units and invalid
sexagesimal minutes/seconds remain unknown with diagnostics. Safe integer checks
also refuse raw 16-digit integers that JavaScript would otherwise round before
unit conversion.

Target coordinates (WI 81–83) and station coordinates (WI 84–86) have separate
fields. Station-only records cannot become target points, even when general
warnings are acknowledged. Neither file order nor repeated target names supplies
station/backsight context. Original shots remain separate, with an explicit setup
warning and no automatic meaned/reduced observations.

The source references are manufacturer-authored documentation, accessed through
mirrors: [Leica GSI ONLINE, format/unit tables](https://www.geoskola.hr/~slavicek/instrumenti/Leica_gsi_manual.pdf)
and [Leica Geo Office help, Standard GSI Word Indexes](https://www.surveyteq.com/uploads/p_50D23E04-086E-8DAB-BABB-C58AC5C0945A-1517141414.pdf).
The independent literal gon fixture also uses
[Autodesk's published GSI example](https://help.autodesk.com/cloudhelp/2026/CHS/MAP3D-EntIndModels/files/GUID-B9561038-6DDC-4AD7-A18D-0DB16DB49CBC.htm):
197.237 gon becomes 177.5133 degrees. These examples do not establish support for
every Leica model, firmware or export dialect.

## Additional reproduced source failures

The integration review reproduced ten failing checks with nineteen controls
passing: the published unprefixed GSI-16 literal was treated as GSI-8, seven
linear fields accepted an unsafe raw integer, and horizontal-distance-only or
height-difference-only records disappeared from the adapter. Detection now also
uses the explicit 23-character first word, unsafe linear integers are refused,
and all supplied angle/distance observation fields participate in observation
inventory. A setup is still not inferred.

A subsequent shared-authority regression proved that a valid first GSI-16 target
could be imported while a later GSI-8 row was silently lost. Another reproduced
a lost distance after an extra word separator. The parser now verifies consistent
word widths across the file before accepting it and normalizes only separators
for decoding. Inconsistent structure produces a parser failure and adapter error;
warning acknowledgement cannot override it. Original input text is not modified.
The first mixed-width test used an out-of-range first coordinate and was corrected
before the meaningful red reproduction; that initial range refusal is not claimed
as evidence of unsafe acceptance.

Independent fixtures retain zero/negative heights and distinguish the station and
target coordinate sets in both word orders. The unprefixed 16-digit target also
passes through the real shared point-import authority with easting 500000 m,
northing 9850000 m and an explicitly confirmed zero height. No CRS, height datum,
station origin, backsight or field truth is inferred by those fixtures.

## Acceptance boundary

Focused source tests cover the real parser, adapter and shared preview/commit
authority, with adjacent client/server/import regressions. They do not replace
authenticated native PostgreSQL import, browser delivery or actual instrument
files. The existing raw source retention and explicit project-reference workflow
remain authoritative. No applied migration was changed.

The final focused run passes **131 checks across ten suites**: GSI observations,
station coordinates, coordinate units, parser behavior, unified import, adjacent
coordinate/new-parser integrity, and shared/client/server point-import paths.
Both strict TypeScript projects, scoped ESLint and whitespace checks pass.
The security gate passes with all 119 pinned applied migration hashes intact.
The required read-only runtime check also passes for the single existing app
and its supporting services; this does not deploy the changed importer.

Setup/backsight and correction metadata, legacy standalone face/traverse utilities,
complete supported-dialect coverage, model/firmware-specific files, independent
control/height checks and receiving-application round trips remain open. The
topographic pilot and broader engineering/commercial acceptance remain active.
