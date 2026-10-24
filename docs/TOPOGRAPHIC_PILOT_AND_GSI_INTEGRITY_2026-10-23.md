# Topographical pilot and GSI measurement integrity

## Recommended first pilot

Use one small topographical job with a practising surveyor, independently checked
control and a known height benchmark. Borrow or rent available calibrated equipment
before buying equipment for software testing. These are proposed acceptance targets,
not a METARDU compatibility certification or a local supplier/price assessment.

| Role | Recommended target | What to retain and validate |
| --- | --- | --- |
| GNSS | Emlid Reach RS4; an existing receiver with documented equivalent exports can also be used | Original RINEX observation/navigation files, antenna identity and measured height, timestamps, correction source and base coordinates, coordinate/height references, receiver firmware and fix diagnostics. Emlid documents RINEX logging and NMEA output on its [RS4 specification](https://emlid.com/reachrs4/). |
| Total station | Calibrated Leica FlexLine TS07, with prism, pole, tripod and recorded prism constant | Exact model, angular accuracy variant, calibration record, firmware, raw observations, station/backsight/control, face observations, instrument/prism heights, units and the actual exported file dialect. The [Leica product page](https://leica-geosystems.com/products/total-stations/manual-total-stations/leica-flexline-ts07) describes the instrument family; it does not establish our importer compatibility. |
| Independent heights | Checked level and staff tied to the benchmark | Original readings and an independently calculated closure under criteria adopted before the job. Do not equate GNSS ellipsoidal height with the required project height datum. |
| Receiving applications | QGIS and access to licensed Civil 3D for acceptance | Check declared CRS, point identity/count, coordinates, missing versus zero heights, codes, CAD geometry and supported surface exchange. QGIS documents [CAD/data import](https://docs.qgis.org/3.44/en/docs/user_manual/managing_data_source/opening_data.html); Civil 3D documents [LandXML exchange](https://help.autodesk.com/cloudhelp/2023/ENU/Civil3D-UserGuide/files/GUID-C77216E8-09FA-4D63-8182-400E9C2DB0A4.htm). |
| Field client | Existing supported Android phone/tablet and the actual intended browser/app build | Device/OS/app identity, interruption/restart/reconnection and offline durability evidence. Manufacturer Bluetooth support alone does not establish browser BLE compatibility. |

One rover requires a verified usable correction service for RTK; otherwise arrange a
base and rover with reviewed base control. Do not presume local service coverage,
subscribe to a service, purchase hardware or invent base coordinates as part of
this recommendation. Existing RS3 or other equipment can be a separate named
validation target rather than a reason to delay the pilot.

Start with retained GSI/CSV/RINEX file workflows. Record input bytes/hashes, project
reference definitions, parser diagnostics, reviewed setup and resulting outputs.
Validate live connections separately with the actual device and firmware. The
[RS4 NMEA documentation](https://docs.emlid.com/reachrs4/specifications/nmea-format/)
includes vendor-specific messages; generic NMEA/BLE code is not evidence of full
tilt-compensation or hardware support.

Before acquisition, agree the intended topographical deliverable, independent
check observations, tolerances and pass/fail criteria with the pilot surveyor.
Capture repeat occupations and withheld check points; process and compare in an
independent established workflow. Open the actual exported files in the receiving
applications, inspect plotted output, and perform supported offline/retry/conflict
tests. Retain the failed cases as well as the successful cases. An attractive map
or a FIX flag alone does not satisfy the pilot.

## GSI source correction

The review found that observation angles were all divided by 100000 without
interpreting the angular unit flag. Gon values were therefore exposed as degrees,
and packed sexagesimal values were treated as decimal degrees. Observation lengths
and instrument/prism heights also assumed millimetres regardless of the word's
linear unit flag. The adapter guessed the first coordinate as a station and
automatically paired observations without established setup context.

The source correction now:

- Decodes gon, decimal-degree and packed degree/minute/second words to decimal
  degrees; rejects malformed payloads, unsupported flags, invalid minutes/seconds
  and angles outside one revolution with diagnostics.
- Uses the existing declared-unit decoder for slope/horizontal distance, height
  difference and instrument/prism heights. Foot words require an explicit foot
  definition; unknown units do not become millimetres.
- Uses normalized degrees for the existing zenith-angle face inference. This is
  an inference, not a retained explicit instrument face declaration.
- Retains original observations without guessing a station from coordinate order
  or automatically reducing/pairing shots across unreviewed setups.

Unit definitions and literal examples were checked against the manufacturer-authored
[GSI ONLINE for Leica TPS guide, academic mirror](https://www.geoskola.hr/~slavicek/instrumenti/Leica_gsi_manual.pdf)
and [Autodesk's published GSI example](https://help.autodesk.com/cloudhelp/2026/CHS/MAP3D-EntIndModels/files/GUID-B9561038-6DDC-4AD7-A18D-0DB16DB49CBC.htm).
Tests use independently calculated expected measurements, including the published
197.237 gon example becoming 177.5133 degrees. Invalid synthetic legacy fixtures
were replaced with valid packed angles and published 16-digit examples.

## Verification and remaining gates

On 2026-10-23, six total-station import suites passed **92 tests**, and three point
import client/server/core suites passed **19 tests**. Scoped ESLint and both strict
application and test TypeScript checks passed.
The regression tests first reproduced the unit/setup failures before the repair.

This is source/parser evidence. No physical instrument, live RS4/TS07 connection,
field control, receiving-application round trip or new production app release was
validated in this batch. No production lifecycle operation, migration or customer
record change was performed for it.

Remaining importer work includes setup/backsight and correction metadata mapping, the legacy
standalone face/traverse conversion utilities, complete supported-dialect coverage
and actual instrument files. Removing automatic adapter reduction does not certify
those older utilities. Broader production, recovery and field gates remain in the
main readiness roadmap and other evidence documents.

## Station/target separation continuation

The next review verified that WI 84-86 are station coordinates, while WI 81-83
are target coordinates, against the Leica guide's GET tables (pages 13, 26 and
35). Previously both sets wrote the same target fields, making results depend
on word order and allowing a station-only file into the point-import path.

The parser now retains station coordinates in separate fields with their own
record marker. They cannot overwrite or invalidate target coordinates. The
adapter excludes station-only coordinates from target points, explains the
exclusion, and continues to require separate setup review. It does not infer
station identity, propagate setups to later shots or automatically reduce them.
Original files remain the retained source for the unified import workflow.

Seven assertions across parser/adapter/core tests first reproduced the old
behavior. After the repair, ten focused suites passed **117 tests**, covering
both word orders, zero/negative heights, invalid station units, station-only
imports and the existing import paths. Both strict TypeScript projects, scoped
ESLint and the tracked-file whitespace check passed. This remains source evidence, with no
production or physical-field acceptance implied.
