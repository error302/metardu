# METARDU production and international readiness recommendations

Assessment date: 23 October 2026 (Africa/Nairobi).

This reviews the owner's pasted international-expansion proposal against selected
current source, existing acceptance records and fresh read-only runtime checks.
It is an advisory assessment, not a complete code/security audit, deployment,
professional certification or proof of field accuracy. Existing implementation
work and the continuing goal in `PRODUCTION_GOAL.md` remain authoritative.

## Recommendation

Make METARDU dependable for a defined survey job before describing it as ready
for every surveyor. Build one shared survey core, explicit jurisdiction packs
and a published matrix of supported workflows, instruments and file versions.
Retain Kenya as a supported jurisdiction. International revenue is a hypothesis
to validate with working surveyors and paid pilots, not evidence that another
market will be easier.

The initial release should close control, observations, adjustment, drafting,
review and delivery for a chosen job. Topographical survey with a control/level
report and usable CAD/PDF/data handover is a reasonable candidate, subject to
pilot-surveyor demand. Other workflows can graduate independently. A supported
topographic release does not establish cadastral lodgment or full road-design
readiness.

## Evidence checked now

| Check | Observed result | What it establishes |
| --- | --- | --- |
| `npm run docker:verify` | Passed with host Docker access after restricted access failed. App, worker, PostgreSQL, Redis, collaboration and NTRIP healthy; backup running without a configured healthcheck; migration service completed with application image; HTTP/database/Redis passed; one app container. | Current stack health and inventory, not complete feature correctness. |
| Backup receipt reported by verifier | Completed at `2026-10-22T02:00:03Z`. | Archive/header evidence for that receipt, not a customer/offsite restore or measured recovery time. |
| `npm run docker:verify:worker` | Failed: deployed `main.py` and `requirements.txt` differ from checkout; six checked modules absent, including `rtklib_baseline.py` and `pointcloud_processor.py`; `laspy`, `lazrs`, `pyproj` distribution metadata absent; `parse_lidar` declaration absent. | A current source/production artifact gap. It does not prove every older worker capability fails. |
| `src/lib/validation/apiSchemas.ts` | Coordinate schema still defaults to literal SRID 21037 and Kenya coordinate bounds; traverse schema also uses Kenya bounds. | These contracts need deliberate internationalization and consumer review. Not evidence that all routes use this schema. |
| `src/types/field.ts` | Coordinate-system union remains limited to WGS84 and selected Kenyan/UTM names. | A limited type contract to reconcile with the shared CRS authority. |
| `src/lib/country/standards.ts` | AU/UK/UAE/ZA entries exist, including numeric tolerances and regulatory claims. | Configuration exists; entries are not independently verified standards or jurisdiction approval. |
| Current online-transform source | Explicit accuracy `not-established`, applicability `not-verified`, horizontal-only operation, heights preserved unchanged; grid-dependent operations rejected. | Honest constraints in current source. Some of this is concurrent uncommitted work; this assessment does not claim it is deployed or freshly tested. |

Recent records show useful progress in native Fieldbook revision delivery,
ordinary synthetic browser recovery, native RTKLIB probing and synthetic
PostgreSQL restoration. Consult `FIELDBOOK_NATIVE_ACCEPTANCE.md`,
`FIELDBOOK_BROWSER_RECOVERY_2026-10-22.md`,
`GNSS_NATIVE_ACCEPTANCE_2026-10-22.md` and
`RECOVERY_FAILURE_PATH_AUDIT_2026-10-22.md` for their precise limits. Their test
counts are historical evidence, not tests rerun in this assessment.

## Changes to the pasted proposal

1. **Replace an EPSG regex/default with explicit reference admission.** A
   well-formed code does not establish a registered CRS, a valid operation,
   suitable accuracy or area of use. Country selection can suggest options;
   the surveyor must confirm the actual project reference. Never replace a
   missing Kenyan reference with an Australian default, or relabel old points.
2. **Treat jurisdiction as project data.** Account location/country cookies are
   preferences. Persist project country, relevant state/emirate/registry,
   reference systems, adopted criteria and pack version on the server. Existing
   project references win over later changes to user preferences.
3. **Separate projection, datum transformation and height conversion.**
   Registering British National Grid is not implementing OSTN15/OSGM15. OS
   describes OSTN15 as a grid transformation that models OSGB36 distortions;
   a simple Helmert transform does not replace it. See the
   [official OSTN15 explanation](https://docs.os.uk/more-than-maps/a-guide-to-coordinate-systems-in-great-britain/from-one-coordinate-system-to-another-geodetic-transformations/national-grid-transformation-ostn15-etrs89-osgb36).
4. **Review country rules before activation.** Do not turn existing UK closure
   ratios, decimal places or qualification claims into statutory pass/fail
   decisions without authoritative references and professional review. HM Land
   Registry covers England and Wales; its title plans generally show general
   boundaries. An applicant's prepared plan is distinct from an official title
   plan. See [practice guide 40, supplement 5](https://www.gov.uk/government/publications/land-registry-plans-title-plan/land-registry-plans-title-plan-practice-guide-40-supplement-5).
5. **Handle South African axes throughout the data path.** Import, computation,
   bearings, persistence and export need the declared convention, not just a
   display adapter. The proposal/registry's GRS80 attribution also needs
   correction: NGI identifies the Hartebeesthoek94 reference ellipsoid as WGS84.
   Cape Datum must not be used as a height-datum label. Validate the actual
   vertical reference separately. See [NGI's datum history](https://ngi.dlrrd.gov.za/index.php/home/history)
   and [official SACRS explanation](https://www.ngi.gov.za/index.php/resources?download=37%3Athe-south-african-coordinate-reference-system).
6. **Make cadastral packs jurisdiction-specific.** Generic LandXML is not a
   complete Australian cadastral submission. Victoria's ePlan includes survey,
   parcel and administrative information and uses validation services; a generic
   exporter is an interoperability feature until the intended workflow passes.
   See [SPEAR's ePlan guidance](https://www.spear.land.vic.gov.au/spear/pages/eplan/about/faqs.shtml).
7. **Treat pricing as a pilot experiment.** The proposed subscription amounts
   and claims about willingness to pay are unvalidated. Payment-provider account
   eligibility, settlement, tax, currency and actual purchase/refund behavior
   must be checked before choosing a provider and advertising prices.

## Ordered implementation and acceptance

| Priority | Work to complete or improve | Acceptance criterion |
| --- | --- | --- |
| P0 | Security and ownership | Resolve the exposed signing-key blocker recorded in `PRODUCTION_GOAL.md` when its owner deferral is lifted; verify invalidation and ordinary sign-in. Exercise cross-account/role access, private offline reopening and shared-device account switches. No other account can read or replay retained work. Never restore the exposed key as rollback. |
| P0 | One coherent release | Pin reviewed app/worker/migration/backup artifacts, resolve worker drift, preserve applied migration hashes, review compatibility and current rollback. Actual supported tasks succeed through ordinary authenticated application routes on the promoted revision. |
| P0 | Recoverable field work | Finish actual offline, interruption, quota, competing-tab, reconnect and account-switch acceptance on supported physical devices. Originals survive; one request creates one acknowledged delivery; stale revisions require review; unresolved work stays visible and exportable. Extend existing journals rather than building a second sync system. |
| P0 | Customer recovery and operations | Review the rejected-clone gate before any further rehearsal. Prove an authorized recovery of the required database/uploads/configuration/key material in an isolated owned target, including offsite access. Agree and measure recovery-point/time objectives, monitoring and failure alerts. Synthetic restore success remains separate. |
| P1 | Survey reference and control contract | Save horizontal CRS, datum realization/epoch where relevant, units, axis/bearing convention, vertical datum/geoid, local-site calibration, control/benchmark provenance and grid-to-ground treatment. Unsupported transformations and missing control prevent issue. Zero stays zero; unknown stays unknown. |
| P1 | Independent numerical acceptance | Maintain versioned reference datasets with provenance and expected tolerances for traverse/network adjustment, leveling, resection, scale/reductions, areas, terrain/volumes and supported alignments. Test covariance/weights, residuals, degeneracy and bad inputs. Compare to independent authoritative or checked results; same-engine round trips alone are insufficient. |
| P1 | Traceable project chain | Bind raw observations, setups, control/design versions, computation runs, measured QA, review decisions and issued files. Editing an upstream input marks affected results stale and blocks accidental issue. Preserve original rejected observations and documented exclusions. Extend the existing deliverable register. |
| P1 | Practical field operation | Validate the supported total-station/GNSS imports and connections using real files and hardware. Cover station setup/backsight, HI/HT, prism constants, instrument calibration, antenna reference, fix/correction age and independent checks. Publish exactly which models/firmware/formats are supported. |
| P1 | Finish one complete survey workflow | Take a real pilot job from project/control through original observations, adjustment, coded features/breaklines, terrain/contours, review and delivered CAD/PDF/data. Reopen it after interruption and have a practising surveyor independently review measurements and outputs. |
| P1 | File and paper fidelity | Open exported supported DXF/LandXML/CSV files in target applications. Compare coordinates, units, axes, heights, layers/codes, breaklines, parcel arcs and identifiers. Inspect complete schedules and physically measure printed scale with print settings recorded. Document deliberate format limitations. |
| P1 | Jurisdiction-pack authority | Each rule records issuing body, source/version, applicability, units, effective date and review status. Adopted project criteria are revision-bound. Unsupported/outdated packs cannot produce an automatic compliance claim. |
| P2 | Dependable commercial operation | Prove purchase, webhook authenticity/replay, entitlement, failed renewal, cancellation/refund, invoices and support escalation. Expiry must preserve prior survey records and a defined recovery/export route. Publish terms and privacy/data-retention commitments matching actual operation. |
| P2 | Professional everyday usability | Review the whole supported workflow on desktop/mobile: legible sunlight/field entry, keyboard/touch access, complete loading/error/empty/offline states, useful corrective messages, performance limits and beginner guidance. Make local, queued, server-saved, checked and issued states unmistakable. |

Security, recovery and artifact alignment are release gates, not optional work
to defer until international sales. Numerical correctness and professional field
acceptance are also gates for whichever workflows a release advertises.

## Country-pack design

Use a shared core plus independent adapters:

- **Survey core:** reviewed calculations, reference-operation interface, raw
  observation/provenance, revision control, QA, permissions and recovery.
- **Workflow definitions:** topographical, construction set-out/as-built,
  cadastral, and road/engineering; supported states and issue checks per job.
- **Jurisdiction packs:** relevant subjurisdiction, verified references and
  operations, adopted rules, plan templates, sources, review and version.
- **Instrument/file adapters:** explicit supported dialects and versions;
  original files retained and conversions recorded.
- **Commercial settings:** currency, billing and language; these never select
  survey CRS, legal authority or accuracy requirements.

Use the established computation authorities behind a stable interface. Where
authoritative grid/epoch operations require a native library, integrate and
validate them through the existing worker path rather than duplicating formulas
in React. Offline availability and missing-grid behavior need their own checks.

## International rollout

Select the first foreign jurisdiction by access to an engaged practising pilot
surveyor, representative datasets, a repeated job and a clear deliverable. The
review did not establish demand or justify a fixed AU/UK/UAE/ZA launch order.

| Target | Practical initial scope | Gate before wider claims |
| --- | --- | --- |
| Australia | One state and a defined topo/construction workflow; declared MGA/GDA and height-reference handling. | Independently check transformations and heights, target-app files and local review. AUSGeoid2020 provides ellipsoid-to-AHD separation values with uncertainty and onshore applicability; do not substitute an unspecified geoid. [Geoscience Australia](https://www.ga.gov.au/scientific-topics/positioning-navigation/positioning-australia/geodesy/ahdgm/ausgeoid2020). Cadastral ePlan requires its own jurisdictional acceptance. |
| Great Britain; England/Wales plan workflows where applicable | Survey data/report/CAD workflow with validated reference operations; define the actual territorial scope. | OSTN15/appropriate height-model checks and independent review. Keep Scotland/Northern Ireland and registry-specific deliverables separately scoped. A drawn boundary does not become an official registry title plan. |
| South Africa | Explicit Lo axis/bearing/units and datum/height handling, verified across imports and outputs. | Independent control/known-answer comparisons and local professional review before cadastral/CSG claims. |
| UAE | One emirate/authority and a specified engineering/topographic deliverable. | Confirm that authority's actual horizontal and vertical requirements, control/service access and submission process. Dubai's DVRS is a concrete local service, not a universal UAE reference definition. [Dubai Municipality](https://www.dm.gov.ae/survey-department/dubai-virtual-reference-station/). |

Do not promise native DWG authoring, drone photogrammetry, full BIM, a LiDAR
production pipeline, every instrument or every country's cadastral submission
as part of the first acceptance target. Add those when a validated customer
workflow warrants their cost and maintenance.

## Definition of ready

A release can be called production-ready **for its named supported workflows**
when all of these have current, revision-bound evidence:

1. Independent numerical/reference checks pass within adopted criteria.
2. Actual field hardware and observations validate the advertised capture and
   set-out paths, with practising-surveyor review.
3. Raw work survives the supported interruption/offline/conflict cases.
4. Calculations, review and issued deliverables refer to the same retained data.
5. Files work in the named receiving applications and paper output is inspected.
6. Security, access control, recovery and operational alerts pass their checks.
7. One pinned production artifact passes ordinary-account end-to-end acceptance,
   with migrations and rollback reviewed and remaining limitations published.
8. The advertised paid lifecycle and support arrangements work.

The next concrete milestone is a reviewed pilot release for one complete survey
workflow, not a global feature checklist. No production service, customer record,
secret, existing drawing, migration ledger or existing source change was modified
by this assessment. Only this recommendations document was added.

## Implementation continuation

The owner subsequently authorized implementation. The source batches
are documented separately:

- `WORKER_RELEASE_HARDENING_2026-10-23.md`: explicit baseline/LAS worker admission,
  strict result validation, a built reusable Linux worker candidate with source,
  ASGI and native RTKLIB tests, plus the remaining coordinated-promotion gates.
- `DELIVERABLE_REGISTER_ATOMICITY_2026-10-23.md`: native reproduction and repair
  of partial registrations, missing evidence, concurrent first exports and stale
  approval/source metadata. No applied migration was changed.
- `TOPOGRAPHIC_PILOT_AND_GSI_INTEGRITY_2026-10-23.md`: recommended pilot equipment,
  independently checkable field acceptance, GSI angular/linear unit corrections
  and removal of guessed station/automatic reduction context. A subsequent
  station/target separation repair prevents station-coordinate words from
  overwriting target points or entering a station-only point import.
- `EXPLICIT_UTM_API_REFERENCES.md`: removes implicit Kenyan horizontal references
  from standalone corridor-network and boundary-monument creation, checks
  redundant metadata against the shared CRS authority, and validates coordinate
  pairs/ranges before SQL. These UTM record APIs do not establish country support.
- `CORRIDOR_VERSION_PRESERVATION.md`: native SQL, transaction rollback,
  owner-supersession and competing-first-version checks on the actual handler.
- `TOPOGRAPHIC_PROJECT_REVIEW.md`: selected-project navigation and scoped review
  notes, with manual checklist status separated from computation/approval.

These checkpoints retain the roadmap's evidence boundaries. They do not close
field-device, independent survey-control, customer/offsite recovery, paid
lifecycle or final production-promotion acceptance.
