# Beacon re-establishment

This workflow records an observed replacement without editing the coordinate
that older plans cited. The source API and migration are tested against synthetic
PostgreSQL records. They are not deployed to `metardu.space`; the registry UI and
broader registry search/adoption workflows still need integration and validation.

Before recording a replacement, select an owned project with a saved projected
metre reference. Only the mark's creator can replace it. An existing project
assignment must agree with the selected project. A global mark can be scoped to
that project for its replacement while the original record remains unchanged.

Supply the observed coordinate, observation time, instrument, ties to control,
and the reason for replacing the mark. Declare both the original and observed
horizontal reference explicitly. They must match the saved project grid; this
endpoint performs no datum conversion. A supplied height needs the project's
vertical datum. An unobserved height remains `null`; zero is retained as zero.

The original datum for a legacy row is a surveyor declaration, rather than an
inference from old registry defaults. The capture identifies that distinction.
The new mark receives a local reference number, unknown coordinate uncertainty,
zero verification confidence and no adoption/verification claim. Official
designation, control verification and statutory approval remain separate work.

The existing registry still has coordinate-range constraints that prevent full
global grid support. The writer reports unsupported grids/ranges explicitly.
Registry proximity searches now require an explicit projected metre grid,
filter by that exact CRS, exclude superseded records, and calculate distance
before applying the result limit. Downstream adoption and the separate public
control-point workflow still need an evidence and CRS audit before the complete
workflow can be considered production ready.

## Source API contract

`POST /api/beacons/{beaconId}/reestablish` requires an authenticated session.
For an isolated source deployment, an example synthetic payload is:

```json
{
  "requestId": "c48bbaf7-f89b-4789-af59-27b233414476",
  "projectId": "cfe208bf-647a-4f51-8328-b7c2ad054f46",
  "easting": 500000.01234,
  "northing": 9800000.05678,
  "elevation": 0,
  "horizontalCrs": "EPSG:21037",
  "originalHorizontalCrs": "EPSG:21037",
  "verticalDatum": "Synthetic BM",
  "ties": "SYN-A 12.000 m; SYN-B 18.000 m; synthetic only",
  "instrument": "Synthetic total station TEST-ONLY",
  "note": "Synthetic damaged mark re-observed; not field evidence",
  "observationDate": "2026-10-01T09:00:00+03:00"
}
```

Keep the same `requestId` when retrying a lost response with identical evidence.
A successful first submission returns `201`. An identical retry returns the
original capture with `200` and `replayed: true`. Changed evidence under the same
request ID, or a different replacement for a superseded predecessor, returns
`409`. The parent project and predecessor are locked in one transaction; the
replacement, immutable capture and successor link either all commit or all
roll back.

`GET /api/beacons/{beaconId}/reestablish` returns the creator's private captures
for the predecessor or replacement. Both responses use `private, no-store`.
The capture retains the previous full registry record, saved project reference,
observed data, authenticated actor and input hash. Published coordinates and
capture records cannot be rewritten through ordinary DML, even by the migration
owner; privileged database administration is still controlled separately.

Verification: `scripts/verify-beacon-reestablishment.mjs`, using explicitly
guarded test database URLs, passed 26 native checks. Only the provider session
is substituted. The actual route wrapper, PostgreSQL transactions, RLS,
immutability triggers and two-client connection pool are exercised.

## Registry interface and declared observations

The registry offers owned project selection, registration, and observed
replacement forms. The saved project declaration supplies the new observation
grid; an undeclared project cannot be selected for a valid submission. The
original grid must still be declared explicitly for a legacy record. Replacement
forms begin with blank observed coordinates and preserve the same request ID
when retrying identical evidence after a failed response.

Registration retains an unobserved height as null, preserves observed zero, and
requires a declared vertical datum when a height is supplied. A registration
creates an audit event linked to the actual row and actor in the same
transaction. Registration does not assign an invented uncertainty or verified
control status. Project choices are private and expose no engineering payload.

The native registry verifier passed 24 checks covering exact proximity centers,
CRS separation, retired marks, owner privacy, missing references, zero heights,
duplicates and audit-failure rollback. React checks cover response rendering and
retry identity. These checks are distinct from packaged browser verification.

The private evidence-history GET endpoint is implemented; a dedicated history
viewer and independently verified control adoption remain outstanding.
