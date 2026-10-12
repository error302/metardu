import { fetchSurveyorProfile } from '@/lib/survey/fetchSurveyorProfile';
import type { RimSection, RimParcel, RimBeacon } from '@/lib/rim/db';
import { uploadFile, getSignedUrl } from '@/lib/storage';
import { db } from '@/lib/db';
import { loadPreAdjustedFromDB } from '../generators/deedPlanGeometry';
import { logger } from '@/lib/logger'

// ── Row interfaces for the queries below (typed via db.query<T>) ──────────────
interface ProjectOwnerRow {
  user_id: string;
  surveyor_name: string | null;
  surveyor_license: string | null;
}
interface SurveyorProfileRow {
  full_name: string | null;
  isk_number: string | null;
  firm_name: string | null;
}
interface ProjectDetailRow {
  name: string | null;
  lr_number: string | null;
  parcel_number: string | null;
  county: string | null;
  division: string | null;
  district: string | null;
  locality: string | null;
  survey_type: string | null;
  survey_subtype: string | null;
  survey_date?: string;
  utm_zone?: number;
  hemisphere?: string;
  datum?: string;
}
interface ProjectNameRow {
  name: string | null;
  lr_number: string | null;
}
interface MutationProjectRow {
  name: string | null;
  lr_number: string | null;
  county: string | null;
  division: string | null;
  district: string | null;
  locality: string | null;
  boundary_data: unknown;
}
interface MutationParcelRow {
  parcel_number: string;
  lr_number_proposed: string | null;
  area_ha: number | null;
}
interface MutationBoundaryData {
  parcelNumber?: string;
  areaHa?: number;
  registryMapSheet?: string;
  adjustedStations?: Array<{
    pointName?: string;
    station?: string;
    adjustedEasting?: number;
    easting?: number;
    adjustedNorthing?: number;
    northing?: number;
  }>;
}

// ── Helper: Fetch surveyor profile data from the project owner ────────────
// ── Helper: Parse a DMS bearing string like "045°30'15\"" to decimal degrees ──
function parseDMSBearing(dms: string): number {
  if (!dms || typeof dms !== 'string') return 0;
  const match = dms.match(/(\d+)[°\s]*(\d+)?['\s]*(\d+\.?\d*)?["\s]*/);
  if (match) {
    const d = parseFloat(match[1]) || 0;
    const m = parseFloat(match[2]) || 0;
    const s = parseFloat(match[3]) || 0;
    return d + m / 60 + s / 3600;
  }
  const num = parseFloat(dms);
  return isNaN(num) ? 0 : num;
}

function parsePrecisionRatio(value: string): number {
  const match = value.trim().match(/^1\s*:\s*(∞|[\d,]+(?:\.\d+)?)$/);
  return !match ? NaN : match[1] === '∞' ? Infinity : Number(match[1].replace(/,/g, ''));
}

// ── Helper: Compute departure/latitude/correction from traverse data ──────
function computeTraverseAdjustment(
  stations: Array<{ station: string; easting: number; northing: number }>,
  bearingSchedule: Array<{ from: string; to: string; bearing: string; distance: string }>,
  misclosureMm: number,
  perimeterM: number,
): Array<{
  label: string;
  observedBearing: number;
  observedDistance: number;
  easting: number;
  northing: number;
  adjustedEasting: number;
  adjustedNorthing: number;
  departureRaw: number;
  latitudeRaw: number;
  departureCorrection: number;
  latitudeCorrection: number;
}> {
  // Compute misclosure in E and N from the adjusted vs. raw coordinates
  const n = stations.length;
  if (n < 2) return [];

  // A coordinate schedule cannot reconstruct raw measurements or Bowditch
  // corrections. Preserve its geometry without applying a second adjustment.
  return stations.map((st, i) => {
    const leg = bearingSchedule[i];
    if (!leg) {
      return {
        label: st.station,
        observedBearing: 0,
        observedDistance: 0,
        easting: st.easting,
        northing: st.northing,
        adjustedEasting: st.easting,
        adjustedNorthing: st.northing,
        departureRaw: 0,
        latitudeRaw: 0,
        departureCorrection: 0,
        latitudeCorrection: 0,
      };
    }

    const next = stations[(i + 1) % n];
    const departureRaw = next.easting - st.easting;
    const latitudeRaw = next.northing - st.northing;
    const dist = Math.hypot(departureRaw, latitudeRaw);
    const bearing = (Math.atan2(departureRaw, latitudeRaw) * 180 / Math.PI + 360) % 360;
    const departureCorrection = 0;
    const latitudeCorrection = 0;

    return {
      label: st.station,
      observedBearing: bearing,
      observedDistance: dist,
      easting: st.easting,
      northing: st.northing,
      adjustedEasting: st.easting,
      adjustedNorthing: st.northing,
      departureRaw,
      latitudeRaw,
      departureCorrection,
      latitudeCorrection,
    };
  });
}

/**
 * Load pre-adjusted traverse coordinates from the database.
 * Delegates to the shared loadPreAdjustedFromDB() from deedPlanGeometry.ts
 * which now includes field book beacon enrichment.
 */

interface GenerateDocumentInput {
  projectId: string;
  documentId: string;
  surveyType: string;
  /** userId from session — for tamper-evident audit chain attribution */
  userId?: string;
}

interface GenerateDocumentResult {
  fileUrl: string;
}

export async function generateDocument(
  input: GenerateDocumentInput
): Promise<GenerateDocumentResult> {
  const { projectId, documentId, surveyType, userId } = input;

  let buffer: Buffer;
  let fileName: string;
  let mimeType: string;

  switch (documentId) {
    case 'rim': {
      const {generateRimPdf}=await import('../rim/rimPdfGenerator');
      const sections=await db.query<RimSection>('SELECT * FROM rim_sections WHERE project_id=$1 ORDER BY updated_at DESC',[projectId]);
      if(sections.rows.length!==1) throw new Error('Save one RIM section for this project in the RIM editor before generating its registry index map.');
      const section=sections.rows[0];
      const [parcels,beacons]=await Promise.all([
        db.query<RimParcel>('SELECT * FROM rim_parcels WHERE rim_section_id=$1 ORDER BY parcel_number',[section.id]),
        db.query<RimBeacon>('SELECT * FROM rim_beacons WHERE rim_section_id=$1 ORDER BY beacon_number',[section.id]),
      ]);
      if(!parcels.rows.length) throw new Error('The RIM section has no parcels. Complete it in the RIM editor first.');
      buffer=Buffer.from(generateRimPdf(section,parcels.rows,beacons.rows));
      fileName=`rim-${projectId}.pdf`;mimeType='application/pdf';
      break;
    }
    case 'traverse-report': {
      const { generateTraverseReport } = await import('../generators/traverseReport');
      buffer = await generateTraverseReport(projectId);
      fileName = `traverse-report-${projectId}.pdf`;
      mimeType = 'application/pdf';
      break;
    }
    case 'levelling-report': {
      const { generateLevellingReport } = await import('../generators/levellingReport');
      buffer = await generateLevellingReport(projectId);
      fileName = `levelling-report-${projectId}.pdf`;
      mimeType = 'application/pdf';
      break;
    }
    case 'field-book': {
      const { generateFieldBookExcel } = await import('../generators/fieldBookExcel');
      buffer = await generateFieldBookExcel(projectId);
      fileName = `field-book-${projectId}.xlsx`;
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      break;
    }
    case 'control-schedule': {
      const { generateCoordinateSchedule } = await import('../generators/coordinateSchedule');
      buffer = await generateCoordinateSchedule(projectId);
      fileName = `coordinate-schedule-${projectId}.xlsx`;
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      break;
    }
    case 'full-package': {
      const { generateFullPackage } = await import('../generators/fullPackage');
      buffer = await generateFullPackage(projectId, userId);
      fileName = `submission-package-${projectId}.zip`;
      mimeType = 'application/zip';
      break;
    }
    case 'deed-plan': {
      if (surveyType !== 'cadastral') {
        throw new Error('Deed Plan is only available for cadastral surveys.');
      }

      // Statutory Validation Gate — refuse to produce a deed plan that
      // ArdhiSasa will reject. See src/lib/validation/statutoryGate.ts.
      const { loadGateInputForProject, mergeGateInput } = await import('../validation/statutoryGateLoader');
      const { runStatutoryGate, formatGateResult } = await import('../validation/statutoryGate');
      const profile = await fetchSurveyorProfile(projectId);
      const loadedInput = await loadGateInputForProject(projectId);
      if (loadedInput) {
        const gateInput = mergeGateInput(loadedInput, {
          surveyor: {
            name: profile.surveyorName || loadedInput.surveyor.name,
            licenseNumber: profile.licenseNumber || loadedInput.surveyor.licenseNumber,
          },
          submissionType: 'mutation',
        });
        const gateResult = runStatutoryGate(gateInput);
        if (!gateResult.passed) {
          const blockCount = gateResult.summary.block;
          const detail = formatGateResult(gateResult);
          throw new Error(
            `Statutory validation failed — ${blockCount} blocking violation(s) prevent deed plan generation.\n\n${detail}`
          );
        }
      }

      const { generateDeedPlan } = await import('../generators/deedPlan');
      buffer = await generateDeedPlan(projectId);
      fileName = `deed-plan-${projectId}.pdf`;
      mimeType = 'application/pdf';

      // Audit chain — record that a deed plan was generated.
      // This is the tamper-evident log entry that proves the plan
      // left the system in a known state. See src/lib/audit/auditLog.ts.
      try {
        const { appendAuditEntry } = await import('../audit/auditLog');
        await appendAuditEntry({
          projectId,
          userId: userId ?? null,
          userName: profile.surveyorName || undefined,
          entityType: 'document',
          entityId: `deed-plan/${projectId}`,
          action: 'generate',
          payload: {
            new: { fileName, mimeType, sizeBytes: buffer.length },
            reason: 'Deed plan generated after statutory gate passed',
            metadata: { gateRuleVersion: '1.1.0' },
          },
        });
      } catch (auditErr) {
        // Audit failure should NOT block the document generation —
        // the surveyor needs their plan. Log and continue.
        logger.warn('[assembleDocument] Audit chain append failed:', { error: auditErr });
      }
      break;
    }
    case 'working-diagram': {
      const { generateWorkingDiagramPdf } = await import('../generators/workingDiagram');
      buffer = await generateWorkingDiagramPdf(projectId);
      fileName = `working-diagram-${projectId}.pdf`;
      mimeType = 'application/pdf';
      break;
    }
    case 'boundary-shapefile': {
      const { generateBoundaryShapefile } = await import('../generators/boundaryShapefile');
      buffer = await generateBoundaryShapefile(projectId);
      fileName = `boundary-shapefile-${projectId}.zip`;
      mimeType = 'application/zip';
      break;
    }
    case 'setting-out-dxf': {
      const { generateSettingOutDxf } = await import('../generators/settingOutDxf');
      buffer = await generateSettingOutDxf(projectId);
      fileName = `setting-out-${projectId}.dxf`;
      mimeType = 'application/dxf';
      break;
    }
    case 'longitudinal-section': {
      const { generateLongitudinalSection } = await import('../generators/longitudinalSection');
      buffer = await generateLongitudinalSection(projectId);
      fileName = `longitudinal-section-${projectId}.pdf`;
      mimeType = 'application/pdf';
      break;
    }
    case 'volumetric-report': {
      const { generateVolumetricReport } = await import('../generators/volumetricReport');
      buffer = await generateVolumetricReport(projectId);
      fileName = `volumetric-report-${projectId}.pdf`;
      mimeType = 'application/pdf';
      break;
    }
    case 'gcp-report': {
      const { generateGcpReport } = await import('../generators/gcpReport');
      buffer = await generateGcpReport(projectId);
      fileName = `gcp-report-${projectId}.pdf`;
      mimeType = 'application/pdf';
      break;
    }
    case 'orthophoto-plan': {
      const { generateOrthophotoPlan } = await import('../generators/orthophotoPlan');
      buffer = await generateOrthophotoPlan(projectId);
      fileName = `orthophoto-plan-${projectId}.pdf`;
      mimeType = 'application/pdf';
      break;
    }
    case 'deformation-report': {
      const { generateDeformationReport } = await import('../generators/deformationReport');
      buffer = await generateDeformationReport(projectId);
      fileName = `deformation-report-${projectId}.pdf`;
      mimeType = 'application/pdf';
      break;
    }
    case 'statutory-workbook': {
      const { generateStatutoryWorkbook } = await import('./workbook/statutoryWorkbook');
      const { computeDeedPlanGeometry } = await import('../generators/deedPlanGeometry');
      const [projectRes, surveyorProfile, preAdjusted] = await Promise.all([
        db.query<ProjectDetailRow>(
          'SELECT name, lr_number, plot_parcel_number AS parcel_number, county, registration_block AS division, registration_district AS district, locality, survey_type, NULL AS survey_subtype, survey_date, utm_zone, hemisphere, datum FROM projects WHERE id = $1',
          [projectId]
        ),
        fetchSurveyorProfile(projectId),
        loadPreAdjustedFromDB(projectId),
      ]);
      const proj = projectRes.rows[0];
      const geom = await computeDeedPlanGeometry(projectId, {
        preAdjustedCoordinates: preAdjusted?.stations,
        preAdjustedClosure: preAdjusted?.closure,
      });
      const perimeterM = geom.bearingSchedule.reduce((s: number, l) => s + (parseFloat(l.distance) || 0), 0);
      const adjustedStations = computeTraverseAdjustment(
        geom.stations, geom.bearingSchedule, geom.misclosureMm, perimeterM
      );
      const precisionRatioNum = parsePrecisionRatio(geom.precisionRatio);

      const rawSurveyType = proj?.survey_type || 'cadastral';
      const validSurveyTypes = ['cadastral', 'engineering', 'topographic', 'leveling', 'control', 'mining', 'hydrographic', 'drone', 'gnss'] as const;
      const safeSurveyType = (validSurveyTypes as readonly string[]).includes(rawSurveyType)
        ? (rawSurveyType as typeof validSurveyTypes[number])
        : 'cadastral';

      buffer = await generateStatutoryWorkbook({
        project: {
          name: proj?.name || 'Cadastral Survey Project',
          lrNumber: proj?.lr_number || 'N/A',
          parcelNumber: proj?.parcel_number || 'N/A',
          county: proj?.county || 'Not supplied',
          division: proj?.division || 'Not supplied',
          district: proj?.district || 'Not supplied',
          locality: proj?.locality || 'N/A',
          surveyType: safeSurveyType,
          surveyDate: proj?.survey_date ? new Date(proj.survey_date).toISOString().slice(0, 10) : 'Not supplied',
          scaleDenominator: NaN,
        },
        surveyor: {
          name: surveyorProfile.surveyorName || 'Not supplied',
          iskNumber: surveyorProfile.iskNumber || 'Not supplied',
          firmName: surveyorProfile.firmName || 'Not supplied',
        },
        submission: {
          referenceNumber: surveyorProfile.referenceNumber || `SUB-${projectId.slice(0, 8).toUpperCase()}`,
          revision: 0,
          status: 'DRAFT — UNVERIFIED',
        },
        fieldObservations: [],
        derivedFromCoordinates: true,
        traverse: {
          method: 'bowditch',
          stations: adjustedStations.map((st) => ({
            label: st.label,
            observedBearing: st.observedBearing,
            observedDistance: st.observedDistance,
            departureRaw: st.departureRaw,
            latitudeRaw: st.latitudeRaw,
            departureCorrected: st.departureRaw + st.departureCorrection,
            latitudeCorrected: st.latitudeRaw + st.latitudeCorrection,
            easting: st.adjustedEasting,
            northing: st.adjustedNorthing,
          })),
          angularMisclosureSec: NaN,
          angularToleranceSec: NaN,
          angularPassesQA: null,
          linearMisclosureM: geom.misclosureMm / 1000,
          perimeterM,
          precisionRatio: precisionRatioNum,
          precisionMinimum: 5000,
          linearPassesQA: geom.closureStatus === 'UNVERIFIED' ? null : geom.closureStatus === 'PASS',
        },
        adjustedStations: geom.stations.map((st) => ({
          label: st.station,
          easting: st.easting,
          northing: st.northing,
          elevation: st.elevation,
        })),
        levelling: null,
        areaComputation: {
          stations: geom.stations.map((st) => ({
            label: st.station,
            easting: st.easting,
            northing: st.northing,
          })),
          areaM2: geom.areaM2 || 0,
          areaHa: geom.areaHa || 0,
          perimeterM,
        },
        legs: geom.bearingSchedule.map((leg) => ({
          fromLabel: leg.from,
          toLabel: leg.to,
          bearing: parseDMSBearing(leg.bearing),
          distance: parseFloat(leg.distance) || 0,
        })),
        cogoResults: null,
      });

      fileName = `statutory-workbook-${projectId}.xlsx`;
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      break;
    }
    case 'form-c22': {
      const { generateFormC22Pdf } = await import('../generators/formC22');
      const { computeDeedPlanGeometry } = await import('../generators/deedPlanGeometry');
      const [projectRes, surveyorProfile, preAdjusted] = await Promise.all([
        db.query<ProjectDetailRow>(
          'SELECT name, lr_number, plot_parcel_number AS parcel_number, county, registration_block AS division, registration_district AS district, locality, survey_type, NULL AS survey_subtype, survey_date, utm_zone, hemisphere, datum FROM projects WHERE id = $1',
          [projectId]
        ),
        fetchSurveyorProfile(projectId),
        loadPreAdjustedFromDB(projectId),
      ]);
      const proj = projectRes.rows[0];
      const geom = await computeDeedPlanGeometry(projectId, {
        preAdjustedCoordinates: preAdjusted?.stations,
        preAdjustedClosure: preAdjusted?.closure,
      });
      const perimeterM = geom.bearingSchedule.reduce((s: number, l) => s + parseFloat(l.distance), 0);
      const adjustedStations = computeTraverseAdjustment(
        geom.stations, geom.bearingSchedule, geom.misclosureMm, perimeterM
      );
      buffer = generateFormC22Pdf({
        derivedFromCoordinates: true,
        utmZone: proj?.utm_zone,
        hemisphere: proj?.hemisphere,
        datum: proj?.datum,
        projectName: proj?.name || '',
        lrNumber: proj?.lr_number || '',
        parcelNumber: proj?.parcel_number || '',
        county: proj?.county || '',
        division: proj?.division || '',
        district: proj?.district || '',
        locality: proj?.locality || '',
        surveyType: proj?.survey_type || 'cadastral',
        surveyorName: surveyorProfile.surveyorName,
        iskNumber: surveyorProfile.iskNumber,
        firmName: surveyorProfile.firmName,
        referenceNumber: surveyorProfile.referenceNumber,
        revision: 'R00',
        stations: adjustedStations,
        angularMisclosureSec: NaN,
        angularToleranceSec: NaN,
        linearMisclosureM: geom.misclosureMm / 1000,
        perimeterM,
        precisionRatio: parsePrecisionRatio(geom.precisionRatio),
        areaM2: geom.areaM2 || 0,
        areaHa: (geom.areaM2 || 0) / 10000,
      });
      fileName = `form-c22-${projectId}.pdf`;
      mimeType = 'application/pdf';
      break;
    }
    case 'area-computation': {
      const { generateAreaComputationSheet } = await import('../generators/areaComputationSheet');
      const { computeDeedPlanGeometry } = await import('../generators/deedPlanGeometry');
      const [projectRes, surveyorProfile, preAdjusted] = await Promise.all([
        db.query<ProjectNameRow>(
          'SELECT name, lr_number FROM projects WHERE id = $1',
          [projectId]
        ),
        fetchSurveyorProfile(projectId),
        loadPreAdjustedFromDB(projectId),
      ]);
      const proj = projectRes.rows[0];
      const geom = await computeDeedPlanGeometry(projectId, {
        preAdjustedCoordinates: preAdjusted?.stations,
        preAdjustedClosure: preAdjusted?.closure,
      });
      buffer = generateAreaComputationSheet({
        projectName: proj?.name || '',
        lrNumber: proj?.lr_number || '',
        surveyorName: surveyorProfile.surveyorName,
        iskNumber: surveyorProfile.iskNumber,
        firmName: surveyorProfile.firmName,
        referenceNumber: surveyorProfile.referenceNumber,
        stations: geom.stations.map((st) => ({
          label: st.station,
          easting: st.easting,
          northing: st.northing,
        })),
        precisionRatio: geom.precisionRatio,
        perimeterM: geom.bearingSchedule.reduce((s: number, l) => s + parseFloat(l.distance), 0),
        adjustmentMethod: geom.coordinateSource === 'computed' ? 'Bowditch (Compass Rule)' : 'Unverified — imported coordinates',
      });
      fileName = `area-computation-${projectId}.pdf`;
      mimeType = 'application/pdf';
      break;
    }
    case 'traverse-computation-sheet': {
      const { generateTraverseComputationSheet } = await import('../generators/traverseComputationSheet');
      const { computeDeedPlanGeometry } = await import('../generators/deedPlanGeometry');
      const [projectRes, surveyorProfile, preAdjusted] = await Promise.all([
        db.query<ProjectDetailRow>(
          'SELECT name, lr_number, plot_parcel_number AS parcel_number, county, registration_block AS division, registration_district AS district, locality, survey_type, survey_date, utm_zone, hemisphere, datum FROM projects WHERE id = $1',
          [projectId]
        ),
        fetchSurveyorProfile(projectId),
        loadPreAdjustedFromDB(projectId),
      ]);
      const proj = projectRes.rows[0];
      const geom = await computeDeedPlanGeometry(projectId, {
        preAdjustedCoordinates: preAdjusted?.stations,
        preAdjustedClosure: preAdjusted?.closure,
      });
      const perimeterM = geom.bearingSchedule.reduce((s: number, l) => s + parseFloat(l.distance), 0);
      const adjustedStations = computeTraverseAdjustment(
        geom.stations, geom.bearingSchedule, geom.misclosureMm, perimeterM
      );
      const precisionRatioNum = parsePrecisionRatio(geom.precisionRatio);

      // Face readings, slope distances and vertical angles cannot be recovered
      // from adjusted coordinates. Do not fabricate instrument observations.
      const observations: [] = [];

      const legs = adjustedStations.map((st, i) => {
        const next = adjustedStations[(i + 1) % adjustedStations.length];
        return {
          from: st.label,
          to: next.label,
          includedAngleDeg: NaN,
          wcbDeg: st.observedBearing,
          hd: st.observedDistance,
          departure: st.departureRaw,
          latitude: st.latitudeRaw,
          depCorrection: st.departureCorrection,
          latCorrection: st.latitudeCorrection,
          adjDep: st.departureRaw + st.departureCorrection,
          adjLat: st.latitudeRaw + st.latitudeCorrection,
        };
      });

      buffer = generateTraverseComputationSheet({
        derivedFromCoordinates: true,
        utmZone: proj?.utm_zone,
        hemisphere: proj?.hemisphere,
        datum: proj?.datum,
        projectName: proj?.name || '',
        lrNumber: proj?.lr_number || '',
        parcelNumber: proj?.parcel_number || '',
        county: proj?.county || '',
        division: proj?.division || '',
        district: proj?.district || '',
        locality: proj?.locality || '',
        surveyType: proj?.survey_type || 'cadastral',
        surveyorName: surveyorProfile.surveyorName,
        iskNumber: surveyorProfile.iskNumber,
        firmName: surveyorProfile.firmName,
        referenceNumber: surveyorProfile.referenceNumber,
        revision: 'R00',
        observations,
        legs,
        coordinates: geom.stations.map((st) => ({
          station: st.station,
          easting: st.easting,
          northing: st.northing,
        })),
        isClosed: true,
        totalPerimeter: perimeterM,
        sumDepartures: adjustedStations.reduce((s, st) => s + st.departureRaw, 0),
        sumLatitudes: adjustedStations.reduce((s, st) => s + st.latitudeRaw, 0),
        linearErrorM: geom.misclosureMm / 1000,
        precisionRatio: precisionRatioNum,
        accuracyOrder: 'UNVERIFIED — consult original adjustment report',
        allowableMisclosureM: NaN,
      });
      fileName = `traverse-computation-sheet-${projectId}.pdf`;
      mimeType = 'application/pdf';
      break;
    }
    case 'mutation-form': {
      const { generateMutationForm } = await import('./generators/mutationForm');
      const [projectRes, surveyorProfile] = await Promise.all([
        db.query<MutationProjectRow>(
          'SELECT name, lr_number, county, registration_block AS division, registration_district AS district, locality, boundary_data FROM projects WHERE id = $1',
          [projectId]
        ),
        fetchSurveyorProfile(projectId),
      ]);
      const proj = projectRes.rows[0];
      const bd = (proj?.boundary_data ?? {}) as MutationBoundaryData;

      // Get resulting parcels from scheme data if available
      const { rows: parcels } = await db.query<MutationParcelRow>(
        'SELECT parcel_number, lr_number_proposed, area_ha FROM parcels p JOIN blocks b ON b.id = p.block_id WHERE b.project_id = $1 ORDER BY parcel_number',
        [projectId]
      );

      buffer = Buffer.from(generateMutationForm({
        parentLRNumber: proj?.lr_number || '',
        parentParcelNumber: bd.parcelNumber || '',
        parentAreaHa: bd.areaHa || 0,
        resultingParcels: parcels.map((p) => ({
          parcelNumber: p.parcel_number,
          areaHa: p.area_ha || 0,
        })),
        county: proj?.county || '',
        division: proj?.division || '',
        district: proj?.district || '',
        locality: proj?.locality || '',
        registryMapSheet: bd.registryMapSheet || '',
        mutationType: 'subdivision',
        reasonForMutation: 'Subdivision of parent parcel',
        affectedBeacons: (bd.adjustedStations || []).map((s) => ({
          beaconId: s.pointName || s.station || '',
          action: 'adopted' as const,
          easting: s.adjustedEasting || s.easting || 0,
          northing: s.adjustedNorthing || s.northing || 0,
        })),
        surveyorName: surveyorProfile.surveyorName,
        iskNumber: surveyorProfile.iskNumber,
        firmName: surveyorProfile.firmName,
        surveyDate: new Date().toISOString().slice(0, 10),
        referenceNumber: surveyorProfile.referenceNumber,
      }));
      fileName = `mutation-form-${projectId}.pdf`;
      mimeType = 'application/pdf';
      break;
    }
    default:
      throw new Error(`Generator not yet implemented for: ${documentId}. This document type is coming in a future phase.`);
  }

  const storagePath = await uploadFile(buffer, fileName, mimeType, `submissions/${projectId}`);
  // Register ownership for the authenticated storage download endpoint.
  await db.query(
    `INSERT INTO file_uploads (user_id, project_id, storage_path, filename, mime_type, size_bytes, upload_purpose)
     SELECT user_id, id, $2, $3, $4, $5, 'submission' FROM projects WHERE id = $1`,
    [projectId, storagePath, fileName, mimeType, buffer.length]
  );
  const signedUrl = await getSignedUrl(storagePath, 60 * 60 * 24 * 7);

  return { fileUrl: signedUrl };
}
