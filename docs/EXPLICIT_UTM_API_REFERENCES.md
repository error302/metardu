# Explicit references for standalone UTM records

Source checkpoint: 23 October 2026, Africa/Nairobi.

## Problem and resulting behavior

The POST routes for `/api/corridor-networks` and `/api/boundary-monuments`
previously supplied Arc 1960, zone 37, southern hemisphere and EPSG:21037 when
reference fields were omitted. Supplying a foreign EPSG code alone could also
leave those Kenyan metadata defaults attached to it. These records are outside
the project-scoped reference-system workflow.

Both routes now require `epsg_code` and validate it through the existing
`projectCrs.ts` authority using `declaredUtmReferenceSchema`. The declaration must
resolve to a registered projected UTM reference in metres. The stored EPSG code,
datum, zone and hemisphere come from that declaration. Optional repeated
`datum`, `utm_zone` and `hemisphere` values must agree with it; a conflicting
value returns a validation error before a SQL query is issued. Web Mercator,
geographic CRS, unknown codes and invalid UTM zones are refused.

Example northern-hemisphere corridor declaration:

```json
{
  "name": "Synthetic control example",
  "epsg_code": "EPSG:32632",
  "control_points": [
    { "point_name": "ZERO", "easting": 500000, "northing": 5800000, "elevation": 0 },
    { "point_name": "UNKNOWN", "easting": 500010, "northing": 5800010 }
  ]
}
```

This stores WGS 84, zone 32, northern hemisphere. It does not transform the
coordinates or establish that they were measured in that CRS. Explicit
EPSG:21037 remains accepted for the Kenyan path.

Corridor control-point coordinates are checked against the declared reference
before any existing version is deactivated. Monument projected coordinates and
latitude/longitude each require a complete pair or both values omitted;
geographic values have finite/range checks. No absent coordinate is replaced by
zero. Existing finite zero and negative heights are retained, and absent height
is not manufactured. This does not establish a vertical datum.

## Compatibility and preservation

This intentionally tightens the creation contract. Callers that relied on
implicit Kenyan references now receive HTTP 400 and must declare the actual
CRS. A zone or country alone is insufficient. The boundary-monument client
input type now makes `epsg_code` required. A source search found the client
service but no in-tree UI invocation of its creation method; external callers
still need a compatibility check before promotion.

Existing rows and applied migrations were not changed. The historical database
defaults remain in place; these repaired POST paths explicitly supply validated
reference values rather than relying on them. Other writers and historical rows
need their own audit. Existing project reference declarations remain authoritative
for project-scoped workflows; this helper does not replace them or infer a CRS
from a country, map, coordinate magnitude or legacy project defaults.

## Verification

The real API wrapper, Zod schemas, CRS authority and handler code were exercised
with synthetic requests and mocked sessions/database/audit/rate-limit services.
The corrected red run reproduced **22 failures out of 26 checks**, including
missing/contradictory references, unsuitable coordinates and persisted metadata.
Additional malformed-input checks caught and corrected a Zod validation-order
case that returned HTTP 500 instead of 400.

The initial five-suite run passed **148 tests**, including 33 API checks plus the
existing point-import, CRS authority, project-reference and stage-reference
tests. They cover anonymous refusal, northern/southern UTM, explicit Kenyan
references, metadata conflicts, invalid CRS with coordinates, pair/range
validation, and original zero/unknown heights. SQL parameter inspection verifies
what the handler submits; it is not a native database execution or RLS test.
Both strict TypeScript projects and scoped ESLint passed. The final API-only
rerun passed all 33 checks after the fixture constants were adjusted for the
repository's hardcoded-CRS lint rule.

The source integration review re-ran the five-suite selection after the GSI
and corridor-owner repairs: **151 tests passed**, including 34 API checks.
The subsequent active-head continuation adds two real-wrapper conflict cases;
its final results are recorded in `CORRIDOR_VERSION_PRESERVATION.md`.

## Remaining acceptance

This is a source/API-contract improvement toward international readiness. It
does not validate a foreign national grid, national datum operation, local
cadastral rules, instrument connection, field control or receiving-application
round trip. These standalone tables currently model UTM references; non-UTM
grids require deliberate storage/workflow support.

The subsequent `CORRIDOR_VERSION_PRESERVATION.md` checkpoint closes the named
corridor version transaction/concurrency and owner-supersession failures with
actual PostgreSQL evidence. Remaining route concerns include broader
resource-level authorization review, monument geometry insertion and
agreement between projected and geographic representations, vertical datum and
epoch/frame provenance, and other pre-existing physical/verification metadata
defaults. Those remain separate acceptance work. Broader Kenya-bound schemas
and jurisdiction-specific traverse rules were not globally relaxed.

No production service or customer data was modified by this batch. No image was
built, no migration applied, and no new source was promoted. Read this alongside
`PRODUCTION_AND_INTERNATIONAL_READINESS_RECOMMENDATIONS.md` and its release,
recovery, security and physical-field gates.
