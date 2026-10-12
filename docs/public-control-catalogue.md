# Referenced control catalogue and project import

This workflow stores source records, independent catalogue reviews and private
project import evidence. Catalogue review is distinct from an on-site control
verification or statutory certification. Coordinate uncertainty is not inferred.

## Surveyor workflow

1. Submit a published mark with its name, coordinates, explicit horizontal EPSG
   grid, source document/revision, publisher and country. Include a vertical
   datum when a height is present. Unobserved height remains null; zero is valid.
2. A different active catalogue reviewer records the source checks and approves
   or rejects the submission. Submitters cannot approve their own records.
3. Search reviewed records by name or coordinates in an explicitly declared
   projected grid. Proximity filtering precedes the result limit. Distance and
   bearing are grid values; a coincident point has no invented azimuth.
4. Select an owned project with a saved reference declaration. Source and
   project horizontal grids must match. A supplied source height also requires
   an identical vertical datum. This import performs no datum transformation.
5. Register the source coordinate under a project point name. Full source and
   project reference snapshots, actor, request UUID, input hash and saved point
   identity are retained in an immutable capture.
6. Verify the physical mark and suitability in the field before adopting it as
   approved control. The project register continues to display registration as
   review-required.

Imported source coordinates are protected against ordinary update/delete DML.
Record a new observation or source submission for a revised basis; preserve
historical published control. Privileged database DDL/administration remains a
separate operational control.

## API and authorization

- `GET /api/public-beacons`: reviewed sources; `mine=true` returns the caller's
  submissions. Nearby searches require both coordinates and their grid. The
  DTO omits submitter/reviewer identities.
- `POST /api/public-beacons`: strict finite source inputs, always pending, with
  a row-linked audit event in the same transaction.
- `GET /api/public-beacons/review-queue`: administrator route plus an active
  database reviewer profile. The queue excludes self-review.
- `POST /api/public-beacons/{id}/review`: independent approval/rejection with a
  reason and full source snapshot. Review and catalogue status commit together.
- `POST /api/public-beacons/{id}/import`: owned declared project, point name and
  request UUID. Identical lost-response retries return the same capture/point.
  Changed request evidence or duplicate project/source imports conflict. Point,
  capture and audit commit together or roll back together.
- `GET /api/project/{id}/control-imports`: current project owner's private import
  captures with full source/reference snapshots.

Responses use `private, no-store`. The generic proxy remains read-only for this
shared table. Database policies prevent submitters from self-asserting reviewed
status. Capture insertion compares the exact PostgreSQL JSON snapshots. Review
timestamps stay inside PostgreSQL so JavaScript Date does not discard their
microseconds.

The frontend provides submission, owned-project selection, private submissions,
review queue and import/retry forms. The reference map loads OpenLayers on
request and uses the shared CRS authority. The survey-map GNSS overlay requests
reviewed same-grid records instead of the old hardcoded station list. Catalogue
review does not claim live CORS availability. Lookup failure is visible and does
not abort the map; initial-map latency under a slow lookup still needs testing.

## Schema and verification boundary

Forward migration 101 adds explicit references, review/import captures, RLS and
immutable-source protections. Legacy SRID defaults are not promoted to explicit
declarations. Migration 102 widens point coordinates to NUMERIC(24,10) so source
values beyond four decimal places are preserved. Storage precision is not
measurement accuracy.

Both migrations were applied only to the marked synthetic rehearsal, now at 107
matching migration entries. The first 102 attempt rolled back because a policy
referenced the precision columns. The unapplied migration was corrected to
replace that policy in the proper order. No applied checksum or customer ledger
was overwritten.

The native verifier passed 44 checks using real route wrappers, restricted
PostgreSQL, RLS, locks and immutable triggers; only provider sessions were
substituted. Checks cover independent review, exact access/reference rejection
reasons, five-decimal coordinates/zero height, audit rollback, concurrency,
replay, private history, numeric point responses and strict manual registration.
Ten focused tests cover reference guards, UI
contracts, retry identity and GNSS catalogue responses. Application/test strict
checks and scoped lint passed. The corrected production package passed 22 HTTP
checks with actual password sessions and the restricted rehearsal database.
An actual browser completed independent review, project import, register
navigation and refresh; the imported point appeared with height 0.000 and
review-required status. Database readback retained the five-decimal source
coordinates and immutable reference evidence. Synthetic browser profiles were
suspended and their temporary password removed afterward.

The first package exposed a point-reader defect: PostgreSQL NUMERIC coordinates
were serialized as strings and the control panel discarded them. The corrected
reader returns numeric XY/Z values with declared reference metadata. Manual
registration now rejects malformed inputs and duplicate active names and saves
the owned project's declared reference with its audit event. Unknown coordinate
uncertainty remains unknown.

The healthy corrected preview uses image
`sha256:6fbb95bcd988433666a2450d6a6a119ca4e018b90e203528102c6aca8f3d4aa2`.
Evidence: `test-results/public-control-points-http/result.json`,
`test-results/public-control-points-browser/result.json`, and
`test-results/runtime-database/public-control-points-source-verification.json`.
The 390-by-844 mobile register scrolls; its wide table requires horizontal
scrolling, while tightly clustered point labels overlap on the map. These visual
limitations and the manual modal's labels/precision controls remain follow-ups.
PWA was disabled for these builds. Provider OAuth, service-worker behavior,
customer-data upgrades and live deployment were not verified by this rehearsal.

The first image attempt was deliberately cancelled after the isolated builder's
daemon held 1,658,248 KiB RSS while the compiler worker held 4,384,104 KiB inside
the same 6 GiB container. No new OOM kill was observed, but compilation was still
running after 1,121 seconds with heavy memory pressure. Restarting only that
builder retained its cache/images and reduced idle memory to approximately
26 MiB. The same source then compiled successfully in 3.9 minutes and completed
the package build under the unchanged limit. After the point-reader fix, the
next package compiled in 3.6 minutes. These observations establish recovery from
builder memory pressure, not a controlled website-performance benchmark or a
permanent change to builder memory management. Strict production typing stayed
enabled and the existing build cache was retained.

Remaining work includes field verification integration, evidenced transforms
between unlike grids, firm/crew import permissions, withdrawal warnings on
historical imports, geographic searches across grids, and replacing the separate
legacy hardcoded benchmark lookup. No official national control dataset is
claimed as ingested or independently checked.
