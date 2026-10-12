import { ellipsoidForDatum } from '@/lib/spatial/projectCrs'

/**
 * Described CRS for reports and exports.
 *
 * Describes ONLY the metadata that was supplied — it never infers a datum
 * from a country or falls back to a default zone. Anything the caller did
 * not fully declare (datum + integer zone 1-60 + hemisphere) comes back
 * as {@link UnverifiedReportCrs} so downstream output can say so instead
 * of guessing. Check `crs.verified` to narrow to concrete values.
 *
 * The vertical datum is carried independently of the horizontal
 * verification (blueprint §31 P0 "Explicit vertical datum/reference"):
 * `crs.vertical` exists only when the caller supplied one, and
 * {@link describeVerticalDatum} renders the undeclared case explicitly so
 * no deliverable silently implies a height reference it was never told.
 */
export interface ReportVerticalDatum {
  /** Datum exactly as the caller supplied it (e.g. 'Kenya Vertical Datum 2005'). */
  datum: string
  /** Height type — only when supplied and one of the registered values. */
  reference?: 'orthometric' | 'ellipsoidal' | 'trig' | 'local'
  geoidModel?: string
  benchmarkBasis?: string
}

export interface VerifiedReportCrs {
  verified: true
  zone: number
  hemi: 'N' | 'S'
  /** Datum exactly as the caller supplied it. */
  datum: string
  /** Bare EPSG digits (e.g. '21037') for `EPSG:${epsg}` rendering. */
  epsg: string
  /** Prefixed code (e.g. 'EPSG:21037'). */
  epsgCode: string
  /** Display name (e.g. 'Arc 1960 / UTM Zone 37S'). */
  crsName: string
  ellipsoid: string
  ellipsoidA: number
  ellipsoidInvF: number
  /** Declared vertical datum — absent when the project never declared one. */
  vertical?: ReportVerticalDatum
}

export interface UnverifiedReportCrs {
  verified: false
  zone: 'UNVERIFIED'
  hemi: ''
  datum: 'UNVERIFIED'
  epsg: 'UNVERIFIED'
  epsgCode: 'UNVERIFIED'
  crsName: 'UNVERIFIED'
  ellipsoid: 'UNVERIFIED'
  ellipsoidA: null
  ellipsoidInvF: null
  vertical?: ReportVerticalDatum
}

export type ReportCrs = VerifiedReportCrs | UnverifiedReportCrs

const UNVERIFIED: UnverifiedReportCrs = {
  verified: false,
  zone: 'UNVERIFIED',
  hemi: '',
  datum: 'UNVERIFIED',
  epsg: 'UNVERIFIED',
  epsgCode: 'UNVERIFIED',
  crsName: 'UNVERIFIED',
  ellipsoid: 'UNVERIFIED',
  ellipsoidA: null,
  ellipsoidInvF: null,
}

const VERTICAL_REFERENCES = ['orthometric', 'ellipsoidal', 'trig', 'local'] as const

function buildVertical(input?: {
  verticalDatum?: string
  verticalReference?: string
  geoidModel?: string
  benchmarkBasis?: string
}): ReportVerticalDatum | undefined {
  const datum = input?.verticalDatum?.trim();
  if (!datum) return undefined;
  const reference = input?.verticalReference?.trim().toLowerCase();
  const v: ReportVerticalDatum = { datum };
  if (reference && (VERTICAL_REFERENCES as readonly string[]).includes(reference)) {
    v.reference = reference as ReportVerticalDatum['reference'];
  }
  const geoid = input?.geoidModel?.trim();
  if (geoid) v.geoidModel = geoid;
  const basis = input?.benchmarkBasis?.trim();
  if (basis) v.benchmarkBasis = basis;
  return v;
}

/** Describe only supplied CRS metadata. Never infer a datum from a country. */
export function reportCrs(input?: {
  utmZone?: number
  hemisphere?: string
  datum?: string
  verticalDatum?: string
  verticalReference?: string
  geoidModel?: string
  benchmarkBasis?: string
}): ReportCrs {
  const vertical = buildVertical(input);
  const zone = input?.utmZone;
  const hemi = input?.hemisphere?.toUpperCase();
  const datum = input?.datum?.trim();
  if (!zone || !Number.isInteger(zone) || zone < 1 || zone > 60 || !['N', 'S'].includes(hemi || '') || !datum) {
    return vertical ? { ...UNVERIFIED, vertical } : UNVERIFIED;
  }
  const normalized = datum.replace(/[\s_-]/g, '').toUpperCase();
  const padded = String(zone).padStart(2, '0');
  const epsg = normalized === 'WGS84' || normalized === 'WGS1984'
    ? `${hemi === 'S' ? '327' : '326'}${padded}`
    : normalized === 'ARC1960' && [35, 36, 37].includes(zone)
      ? `210${hemi === 'S' ? zone : zone + 60}`
      : null;
  const ell = ellipsoidForDatum(datum);
  if (!epsg || !ell) {
    return vertical ? { ...UNVERIFIED, vertical } : UNVERIFIED;
  }
  const datumLabel = normalized === 'WGS84' || normalized === 'WGS1984' ? 'WGS 84' : 'Arc 1960';
  return {
    verified: true,
    zone,
    hemi: hemi as 'N' | 'S',
    datum,
    epsg,
    epsgCode: `EPSG:${epsg}`,
    crsName: `${datumLabel} / UTM Zone ${zone}${hemi}`,
    ellipsoid: ell.name,
    ellipsoidA: ell.a,
    ellipsoidInvF: ell.rf,
    ...(vertical ? { vertical } : {}),
  };
}

const REFERENCE_LABELS: Record<NonNullable<ReportVerticalDatum['reference']>, string> = {
  orthometric: 'Orthometric heights',
  ellipsoidal: 'Ellipsoidal heights',
  trig: 'Trigonometrical heights',
  local: 'Local vertical datum',
}

/**
 * Render the vertical datum statement for deliverables.
 *
 * Declared:   "Orthometric heights — Kenya Vertical Datum 2005 (geoid: EGM2008)"
 * Undeclared: "UNVERIFIED — no vertical datum declared"
 *
 * Never picks a plausible-sounding default (e.g. "ellipsoidal WGS 84") the
 * surveyor did not declare.
 */
export function describeVerticalDatum(crs: ReportCrs): string {
  return describeVertical(crs.vertical);
}

/**
 * Same statement from a bare vertical block — for callers that hold the
 * declared fields directly (ISO metadata, LandXML) instead of a ReportCrs.
 */
export function describeVertical(v: ReportVerticalDatum | undefined): string {
  if (!v) return 'UNVERIFIED — no vertical datum declared';
  const head = v.reference ? REFERENCE_LABELS[v.reference] : 'Vertical datum';
  const geoid = v.geoidModel ? ` (geoid: ${v.geoidModel})` : '';
  return `${head} — ${v.datum}${geoid}`;
}
