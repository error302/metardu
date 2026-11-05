# Concrete gravity dam surveying: capability and acceptance audit

## Scope and evidence boundary

The user supplied a LinkedIn post describing eight construction/operation stages and asked that a surveyor be able to carry out the surveying work using METARDU. The short link https://lnkd.in/p/dkVVNW2A could not be fetched by the research tool; this audit uses the supplied text. Its 3D video was not watched or reproduced.

This is an engineering/surveying requirements and source audit, not a dam safety assessment or a declaration that all stages are currently supported. No dam project, monitoring network, field control, lift, inspection, payment certificate or operating authorization was created. Deployed Web application remains 7290f5c4234b2cd94e3c5dfb399c34d074fdd444, image sha256:20a3f3c2df436a84a05da161618ee867bdf850238373cda2aa28e95f80824c55. Current corrections are source-only until exact admission and promotion.

USACE describes precise structural deformation surveying as an accuracy/procedure/quality-control discipline for hydraulic structures. Reclamation describes concrete-dam instrumentation as several systems with installation, monitoring and data-handling procedures. These references inform the gaps below; they are not substituted for the project's jurisdiction, contract, approved design or engineer-defined monitoring/acceptance criteria.

## Eight-stage mapping

| Stage | Existing concrete starting point | Required evidence/work before a dam-workflow claim |
|---|---|---|
| 1. Topography and control | Retained topo observations/TIN/contour revisions and registered DXF/PDF; network/level adjustment source and tests | Accepted primary/secondary control, network stability, adjusted coordinates/covariance, closures, instrument/calibration records, verified horizontal/vertical datum and epoch, grid-to-ground/height treatment, breaklines/exclusions and independent terrain checks. The actual 42-point Web export is synthetic, not dam control. |
| 2. Diversion and cofferdams | Setting-out engine, schedules/CSV/PDF/DXF and as-built-deviation tools | Import an approved design revision with alignment, limits, design levels, stake IDs and explicit tolerances; retain setup/orientation/check-shot and as-staked/as-built evidence. Hydraulic adequacy and temporary-works approval remain engineering responsibilities. |
| 3. Foundation excavation and treatment | Earthwork section calculations, draft design revisions, as-built deviation and field records | Versioned before/after surveyed surfaces with common valid references, exact common volume boundary, exclusions/void handling and an independent quantity check; excavation hold points, exposed-rock/geological inspection and treatment records. A topographic surface cannot establish bedrock quality or treatment acceptance. |
| 4. Concrete lifts and monoliths | Generic setting-out/deviation and draft quantity revision foundations | A persistent monolith/lift register tying approved geometry to lift ID, date, top elevation, alignment, actual observations, quantity method/source revisions and approval history. Existing cross-section volume is not general 3D concrete-solid takeoff. Concrete temperature/strength/material QA needs authoritative test/instrument records and designated reviewers. |
| 5. Spillway and radial gates | Setting-out sheets and design/as-built differences | Reviewed 3D geometry and approved tolerances for crest, piers, axes, embedded components and gate supports; retained independent checks and installation survey reports. Generic staking or a screening preset cannot certify mechanical installation. |
| 6. Instrumentation and monitoring | Two separate deformation tools and comparison API; monitoring source regressions | One reference-aware, persisted epoch workflow with accepted stable control, instrument observations, full uncertainty/correlation handling, epoch/frame/velocity-model provenance, engineer-approved trigger/action criteria and independently checked reports. Existing defaults/standalone JSON are not an operational dam-monitoring system. Monitoring also includes instruments beyond survey coordinates. |
| 7. Impoundment and commissioning | Generic records, schedules and draft deliverables only; no accepted impoundment workflow | Approved filling/hold-point plan, time-aligned water levels, instrument/inspection records, responsible reviewers and recorded decisions. METARDU must not infer permission to fill, continue filling, or declare a structure safe from a survey threshold comparison. |
| 8. Long-term operation | Project records and source deformation/time-series components | Durable epoch/instrument history, review and audit trails, missed-observation handling, calibration/maintenance provenance, threshold escalation/acknowledgement, independent communications/provider testing and scheduled backup/restore/offsite proof. Local Docker health and a passing synthetic series do not prove continuous monitoring. |

## Quantity surveying boundary

Current section-volume and retained design-revision code is useful computational groundwork. A dam quantity workflow also needs measurement rules, agreed units, void/deduction rules, source and design revisions, valuation periods, cumulative/prior quantities, change orders and competent review. Interim payment certification is not the app's subscription/payment administration. No contract valuation or payment authority is implied by a computed volume.

Relevant source: src/lib/engineering/compute.ts, volume.ts, designRevisions.ts and their volumeIntegrity/quantityRevision tests. Relevant surveying source: src/lib/survey/networkAdjustment.ts; digitalLevel/levelNetworkAdjustment.ts; src/lib/computations/settingOutEngine.ts; src/lib/documents/settingOutSheetSchema.ts; src/lib/compute/asBuiltDeviation.ts; src/lib/topo/surfaceRevision.ts and surfaceExport.ts. File presence is source evidence, not accepted user workflow proof.

## Reproduced monitoring defects and source correction

In src/lib/survey/deformationMonitoring.ts, missing baseline monuments, new monuments without baseline and incomplete uncertainty could still produce STABLE. Invalid standard deviations were squared or skipped, the E-N covariance input was ignored, arbitrary requested confidence levels were labelled using only 95/99-style constants, and a vertical-only report could pair its statistic with a zero horizontal critical value. The screen displayed a passed significance check when uncertainty was not assessed and silently prefilled generic tolerance values. The API used z.custom<EpochSet>() rather than validating the epoch structure.

Regression-first changes now:

- Preserve measured tolerance-exceedance alerts, but make otherwise incomplete comparisons INCONCLUSIVE with named missing/new/uncertain monuments.
- Reject invalid supplied uncertainty and non-positive-definite horizontal covariance; include supplied E-N covariance in the two-epoch horizontal statistic, assuming independent epoch errors.
- Support only the implemented 95% and 99% confidence choices; pair each reported primary statistic with its own critical value and expose partial dimensions.
- Validate API epoch shapes, coordinates, known frames, duplicate IDs, variances/covariance and explicit horizontal/vertical criteria. Refuse unaligned per-monument frames rather than silently equating them.
- Require project tolerances on the screen, show Not assessed/Partial assessment correctly, and provide stacked phone inputs plus a separately scrollable results table.

These changes do not qualify the engine as professional dam monitoring. Remaining numerical/provenance work includes the spherical local displacement approximation, explicit site/plate-model applicability and uncertainty propagation, inter-epoch/network correlations, control stability, time-series statistical methods, instrument integration and durable accepted epoch/review records. The separate src/lib/engine/deformationTracker.ts/tool still has generic thresholds and its own workflow; its dam readiness is unproved. Keep these gaps visible rather than using one corrected function to claim full monitoring acceptance.

Initial tests reproduced 13 failures; the first engine correction passed 27 tests, engine plus screen passed 29, and strict input integration passed 43 tests before the final boundary additions. Retained logs: .cache/deformation-completeness-red.log, deformation-completeness-green.log, deformation-ui-red.log, deformation-screen-green.log, deformation-input-red.log and deformation-comparison-final.log. Subsequent exact type/lint/source/CI receipts govern release eligibility.

## Delivery sequence and acceptance

Keep the eight existing survey types: use construction, engineering, topographic, geodetic, levelling and monitoring workflows with a dam-specific project specification/template; do not create a ninth survey type.

First finish authenticated field-to-office review and real Desktop account recognition already approved by the user. Then connect a synthetic dam package through: accepted control evidence -> terrain/excavation quantities -> approved-design setting-out -> monolith/lift as-built records -> reviewed epoch monitoring -> revision-linked draft handover. Preserve independent checks and explicit hold points at each step. Do not promote a full dam lifecycle claim until each stage has an actual app demonstration, independently checked artifacts and the relevant professional/field acceptance.

Keep migration hashes, customer drawings, records/uploads/supports, rollback and recovery evidence. No production data clone, account/billing modification, new application container or service restart belongs to this audit.

## Primary references reviewed

- USACE Structural Deformation Surveying, EM 1110-2-1009, 1 February 2018: https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-1009.pdf . Primary search excerpts were available; direct PDF fetch returned 403. No clause-specific acceptance tolerance is asserted.
- USACE Dam Safety Program engineering-manual index: https://www.usace.army.mil/Missions/Civil-Works/Dam-Safety-Program/ .
- Reclamation Concrete Dam Instrumentation Manual abstract: https://www.usbr.gov/tsc/techreferences/mands/mands-abstracts/manabs2.html .
- Reclamation manuals index: https://www.usbr.gov/tsc/techreferences/mands/manuals.html . The linked 2016 surveying PDF exceeded the tool's fetch-size limit; its full contents were not claimed reviewed.
- NIST EDA critical chi-square values, df=2: https://www.itl.nist.gov/div898/handbook/eda/section3/eda3674.htm . The 95/99% values support the numerical statistical thresholds, not project displacement limits or dam safety decisions.

Subsequent source verification on 6 November included the final cautious status wording: the combined collaboration/ownership/export/monitoring run passed 173 tests in 17 suites. The earlier six-suite dam-focused run passed 60 tests. All three current TypeScript projects passed. These source results do not change the deployed application identity or establish a complete dam workflow.
