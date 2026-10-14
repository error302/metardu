import { assertProjectedCrs, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import { DEFAULT_SETOUT_TOLERANCE, DEFAULT_SETOUT_TOLERANCE_VERSION, evaluateSetoutShot, computeSetoutDeltas, type SetoutShotResult } from '@/lib/engineering/verticality'
import { resolveSetoutToleranceProfile, type SetoutToleranceProfileSnapshot } from '@/lib/engineering/setoutToleranceProfile'

export interface CaptureCoordinates { easting: number; northing: number; rl: number | null }
export interface SetoutCaptureInput {
  projectId: string; definitionId: string; pointId: string; pointLabel: string; designRevision: number;
  horizontalCrs: string; definitionCrs: string | null; deviceCrs: string | null; verticalDatum: string | null;
  capturedAt: string | null; design: CaptureCoordinates; capturedDesign: CaptureCoordinates; observed: CaptureCoordinates;
  reportedAccuracyM: number | null; profile: SetoutToleranceProfileSnapshot | null;
  reportedVerticalAccuracyM?: number | null;
  deviceVerticalDatum?: string | null;
  capturedToleranceProfileId?: string | null;
}
export interface LegacySetoutCaptureSnapshot extends Omit<SetoutCaptureInput, 'profile' | 'reportedVerticalAccuracyM' | 'deviceVerticalDatum' | 'capturedToleranceProfileId'> {
  schemaVersion: 1;
  algorithm: { id: 'metardu.setout-shot'; version: '1' };
  horizontalCrsEvidence: 'device_and_definition' | 'server_context_only';
  captureTimeSource: 'device_reported' | 'not_provided';
  tolerance: { horizontalM: number; verticalM: number; version: string; source: 'project_profile_transcription' | 'metardu_default'; profile: SetoutToleranceProfileSnapshot | null };
  assessment: SetoutShotResult;
}
export interface CurrentSetoutCaptureSnapshot extends Omit<LegacySetoutCaptureSnapshot,'schemaVersion'|'algorithm'|'tolerance'> {
  schemaVersion:2;algorithm:{id:'metardu.setout-shot';version:'2'};
  reportedVerticalAccuracyM:number|null;deviceVerticalDatum:string|null;capturedToleranceProfileId:string|null;
  tolerance:{horizontalM:number|null;verticalM:number|null;version:string|null;source:'project_profile_transcription'|'not_provided';profile:SetoutToleranceProfileSnapshot|null};
  acceptance:{scope:'numerical_comparison_only';eligible:boolean;issues:string[]};
}
export type SetoutCaptureSnapshot=LegacySetoutCaptureSnapshot|CurrentSetoutCaptureSnapshot

export function normalizeCaptureTime(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new RangeError('Capture time must be an ISO timestamp with a timezone.')
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!parts) throw new RangeError('Capture time must include a full date, time, and timezone.')
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number)
  const lastDay = new Date(0)
  lastDay.setUTCFullYear(year, month, 0)
  const instant = Date.parse(value)
  if (month < 1 || month > 12 || day < 1 || day > lastDay.getUTCDate() || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(instant)) {
    throw new RangeError('Capture time is not a valid calendar timestamp.')
  }
  return new Date(instant).toISOString()
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RangeError('Invalid capture evidence object.')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new RangeError('Capture evidence identifiers must be non-empty text.')
  return value
}
function optionalText(value: unknown): string | null {
  if (value == null) return null
  return text(value)
}
function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError('Capture measurements must be finite numbers.')
  return value
}
function coordinates(value: unknown): CaptureCoordinates {
  const row = object(value)
  return { easting: finite(row.easting), northing: finite(row.northing), rl: row.rl === null ? null : finite(row.rl) }
}
const sameValue=(a:unknown,b:unknown):boolean=>{
  if(a===b)return true
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameValue(v,b[i]))
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false
  const left=object(a),right=object(b),keys=Object.keys(left)
  return keys.length===Object.keys(right).length&&keys.every(key=>Object.prototype.hasOwnProperty.call(right,key)&&sameValue(left[key],right[key]))
}
function profileFrom(value: unknown): SetoutToleranceProfileSnapshot | null {
  if (value === null) return null
  const row = object(value)
  const profile = resolveSetoutToleranceProfile({
    id: row.id, name: row.name, jurisdiction: row.jurisdiction, version: row.version,
    rules: { acknowledged: true, effectiveDate: row.effectiveDate, source: row.source, approvedBy: row.approvedBy,
      setout: { horizontalM: row.horizontalM, verticalM: row.verticalM } },
  })
  if (!profile) throw new RangeError('Capture tolerance profile is incomplete or invalid.')
  return profile
}

/** Persist server-assessed original numbers, not formatted/rounded table values. */
export function createSetoutCaptureSnapshot(input: SetoutCaptureInput): CurrentSetoutCaptureSnapshot {
  if(!Number.isSafeInteger(input.designRevision)||input.designRevision<1)throw new RangeError('Capture design revision must be a positive integer.')
  const comparison=evaluateSetoutCaptureEvidence(input)
  const horizontalCrs=assertProjectedCrs(input.horizontalCrs).code
  const definitionCrs=input.definitionCrs==null?null:assertProjectedCrs(input.definitionCrs).code
  const deviceCrs=input.deviceCrs==null?null:assertProjectedCrs(input.deviceCrs).code
  const capturedAt=normalizeCaptureTime(input.capturedAt)
  return {schemaVersion:2,algorithm:{id:'metardu.setout-shot',version:'2'},
    projectId:text(input.projectId),definitionId:text(input.definitionId),pointId:text(input.pointId),pointLabel:text(input.pointLabel),designRevision:input.designRevision,
    horizontalCrs,definitionCrs,deviceCrs,verticalDatum:optionalText(input.verticalDatum),
    horizontalCrsEvidence:deviceCrs&&definitionCrs?'device_and_definition':'server_context_only',capturedAt,captureTimeSource:capturedAt?'device_reported':'not_provided',
    design:coordinates(input.design),capturedDesign:coordinates(input.capturedDesign),observed:coordinates(input.observed),reportedAccuracyM:input.reportedAccuracyM,
    reportedVerticalAccuracyM:input.reportedVerticalAccuracyM??null,deviceVerticalDatum:optionalText(input.deviceVerticalDatum),capturedToleranceProfileId:optionalText(input.capturedToleranceProfileId),...comparison}
}

export type SetoutComparisonEvidence=Omit<SetoutCaptureInput,'projectId'|'definitionId'|'pointId'|'pointLabel'|'designRevision'>
/** Shared field preview/server authority. A preview never invents a device capture time. */
export function evaluateSetoutCaptureEvidence(input:SetoutComparisonEvidence,requireCaptureTime=true) {
  const crs=assertProjectedCrs(input.horizontalCrs).code
  const definitionCrs=input.definitionCrs==null?null:assertProjectedCrs(input.definitionCrs).code
  const deviceCrs=input.deviceCrs==null?null:assertProjectedCrs(input.deviceCrs).code
  if(definitionCrs!=null&&definitionCrs!==crs||deviceCrs!=null&&deviceCrs!==crs)throw new RangeError('Captured and definition CRS must match the project CRS.')
  const design=coordinates(input.design),observed=coordinates(input.observed),captured=coordinates(input.capturedDesign)
  for(const p of [design,observed,captured]){const range=validateCoordinateRange(p.easting,p.northing,crs);if(!range.valid)throw new RangeError(range.errors.join('; '))}
  const profile=profileFrom(input.profile),capturedAt=normalizeCaptureTime(input.capturedAt)
  const h=input.reportedAccuracyM==null?null:finite(input.reportedAccuracyM),v=input.reportedVerticalAccuracyM==null?null:finite(input.reportedVerticalAccuracyM)
  if(h!=null&&h<0||v!=null&&v<0)throw new RangeError('Reported accuracy/uncertainty cannot be negative.')
  const metrics=computeSetoutDeltas({designE:design.easting,designN:design.northing,designZ:design.rl,observedE:observed.easting,observedN:observed.northing,observedZ:observed.rl})
  const issues:string[]=[]
  const hasLevels=design.rl!=null||observed.rl!=null
  if(design.rl!=null&&observed.rl==null)issues.push('An observed RL is required to verify this 3D set-out target.')
  if(design.rl==null&&observed.rl!=null)issues.push('No design RL was supplied; this level comparison is not assessed.')
  if(!profile)issues.push('Adopted project criteria are not provided; no tolerance profile is inferred.')
  if(profile&&input.capturedToleranceProfileId!==profile.id)issues.push('The captured project criterion identifier is missing or differs from the saved design.')
  if(!definitionCrs||!deviceCrs)issues.push('Capture CRS was not confirmed by both device and definition.')
  if(requireCaptureTime&&!capturedAt)issues.push('Device capture time was not provided.')
  if(design.easting!==captured.easting||design.northing!==captured.northing||design.rl!==captured.rl)issues.push('Captured design coordinates do not exactly match this saved target revision.')
  if(h==null||h<=0)issues.push('Reported horizontal accuracy is missing or 0 (unknown).')
  else if(profile&&h>profile.horizontalM)issues.push('Reported horizontal accuracy cannot prove the entered horizontal criterion.')
  if(hasLevels){
    if(!input.verticalDatum?.trim()||!input.deviceVerticalDatum?.trim()||input.verticalDatum!==input.deviceVerticalDatum)issues.push('The common captured height datum/benchmark reference is missing or differs from the design.')
    if(v==null||v<=0)issues.push('Reported level accuracy is missing or 0 (unknown); horizontal accuracy cannot prove level accuracy.')
    else if(profile&&v>profile.verticalM)issues.push('Reported level accuracy cannot prove the entered vertical criterion.')
  }
  let result:SetoutShotResult['result']='INFO'
  if(!issues.length&&profile){
    const vertical=metrics.verticalErrorM??0
    result=metrics.horizontalErrorM<=profile.horizontalM&&vertical<=profile.verticalM?'PASS':metrics.horizontalErrorM<=profile.horizontalM*3&&vertical<=profile.verticalM*3?'WARN':'FAIL'
  }
  const message=issues.length?issues.join(' '):result==='PASS'?'Within entered numerical limits; construction acceptance and survey control are not verified.':result==='WARN'?'Numerical differences need review; construction acceptance is not established.':'Entered numerical limits exceeded; review the observation and design.'
  const tolerance:CurrentSetoutCaptureSnapshot['tolerance']={horizontalM:profile?.horizontalM??null,verticalM:profile?.verticalM??null,version:profile?.version??null,source:profile?'project_profile_transcription':'not_provided',profile}
  const acceptance:CurrentSetoutCaptureSnapshot['acceptance']={scope:'numerical_comparison_only',eligible:issues.length===0,issues}
  return {assessment:{...metrics,result,message},tolerance,acceptance}
}

/** Frozen v1 interpretation used only for stored historical records. */
function buildLegacySnapshot(input: SetoutCaptureInput, storedTolerance?: LegacySetoutCaptureSnapshot['tolerance']): LegacySetoutCaptureSnapshot {
  const horizontalCrs = assertProjectedCrs(input.horizontalCrs).code
  const definitionCrs = input.definitionCrs == null ? null : assertProjectedCrs(input.definitionCrs).code
  const deviceCrs = input.deviceCrs == null ? null : assertProjectedCrs(input.deviceCrs).code
  if ((definitionCrs != null && definitionCrs !== horizontalCrs) || (deviceCrs != null && deviceCrs !== horizontalCrs)) {
    throw new RangeError('The captured and definition CRS must match the project CRS.')
  }
  if (!Number.isSafeInteger(input.designRevision) || input.designRevision < 1) throw new RangeError('Capture design revision must be a positive integer.')
  const design = coordinates(input.design)
  const observed = coordinates(input.observed)
  const capturedDesign = coordinates(input.capturedDesign)
  for (const point of [design, observed, capturedDesign]) {
    const range = validateCoordinateRange(point.easting, point.northing, horizontalCrs)
    if (!range.valid) throw new RangeError(range.errors.join('; '))
  }
  const profile = profileFrom(input.profile)
  const horizontalM = storedTolerance?.horizontalM ?? profile?.horizontalM ?? DEFAULT_SETOUT_TOLERANCE.horizontalM
  const verticalM = storedTolerance?.verticalM ?? profile?.verticalM ?? DEFAULT_SETOUT_TOLERANCE.verticalM
  const reportedAccuracyM = input.reportedAccuracyM === null ? null : finite(input.reportedAccuracyM)
  const assessment = evaluateSetoutShot({ designE: design.easting, designN: design.northing, designZ: design.rl,
    observedE: observed.easting, observedN: observed.northing, observedZ: observed.rl }, { horizontalM, verticalM, accuracyM: reportedAccuracyM })
  const capturedAt = normalizeCaptureTime(input.capturedAt)
  return {
    schemaVersion: 1, algorithm: { id: 'metardu.setout-shot', version: '1' },
    projectId: text(input.projectId), definitionId: text(input.definitionId), pointId: text(input.pointId),
    pointLabel: text(input.pointLabel), designRevision: input.designRevision,
    horizontalCrs, definitionCrs, deviceCrs, verticalDatum: optionalText(input.verticalDatum),
    horizontalCrsEvidence: deviceCrs && definitionCrs ? 'device_and_definition' : 'server_context_only',
    capturedAt, captureTimeSource: capturedAt ? 'device_reported' : 'not_provided',
    design, observed, capturedDesign, reportedAccuracyM,
    tolerance: { horizontalM, verticalM, version: storedTolerance?.version ?? profile?.version ?? DEFAULT_SETOUT_TOLERANCE_VERSION,
      source: profile ? 'project_profile_transcription' : 'metardu_default', profile }, assessment,
  }
}

/** Unknown versions or inconsistent stored evidence fail closed; never upgrade a legacy row. */
export function parseSetoutCaptureSnapshot(value: unknown): SetoutCaptureSnapshot | null {
  try {
    const row=object(value)
    if(row.schemaVersion===1)return parseLegacySnapshot(value)
    const algorithm=object(row.algorithm),tolerance=object(row.tolerance),acceptance=object(row.acceptance)
    if(row.schemaVersion!==2||algorithm.id!=='metardu.setout-shot'||algorithm.version!=='2')return null
    const snapshot=createSetoutCaptureSnapshot({projectId:text(row.projectId),definitionId:text(row.definitionId),pointId:text(row.pointId),pointLabel:text(row.pointLabel),designRevision:finite(row.designRevision),
      horizontalCrs:text(row.horizontalCrs),definitionCrs:optionalText(row.definitionCrs),deviceCrs:optionalText(row.deviceCrs),verticalDatum:optionalText(row.verticalDatum),deviceVerticalDatum:optionalText(row.deviceVerticalDatum),capturedToleranceProfileId:optionalText(row.capturedToleranceProfileId),capturedAt:optionalText(row.capturedAt),
      design:coordinates(row.design),capturedDesign:coordinates(row.capturedDesign),observed:coordinates(row.observed),reportedAccuracyM:row.reportedAccuracyM===null?null:finite(row.reportedAccuracyM),reportedVerticalAccuracyM:row.reportedVerticalAccuracyM===null?null:finite(row.reportedVerticalAccuracyM),profile:profileFrom(tolerance.profile)})
    if(!sameValue(tolerance,snapshot.tolerance)||!sameValue(acceptance,snapshot.acceptance)
      ||row.horizontalCrsEvidence!==snapshot.horizontalCrsEvidence||row.captureTimeSource!==snapshot.captureTimeSource)return null
    const assessed=object(row.assessment)
    for(const key of Object.keys(snapshot.assessment) as Array<keyof SetoutShotResult>)if(assessed[key]!==snapshot.assessment[key])return null
    return snapshot
  }catch{return null}
}

function parseLegacySnapshot(value: unknown): LegacySetoutCaptureSnapshot | null {
  try {
    const row = object(value)
    const algorithm = object(row.algorithm)
    const tolerance = object(row.tolerance)
    if (row.schemaVersion !== 1 || algorithm.id !== 'metardu.setout-shot' || algorithm.version !== '1') return null
    const savedProfile = profileFrom(tolerance.profile)
    const savedTolerance: LegacySetoutCaptureSnapshot['tolerance'] = {
      horizontalM: finite(tolerance.horizontalM), verticalM: finite(tolerance.verticalM), version: text(tolerance.version),
      source: savedProfile ? 'project_profile_transcription' : 'metardu_default', profile: savedProfile,
    }
    if (savedProfile && (savedProfile.horizontalM !== savedTolerance.horizontalM || savedProfile.verticalM !== savedTolerance.verticalM || savedProfile.version !== savedTolerance.version)) return null
    const snapshot = buildLegacySnapshot({
      projectId: text(row.projectId), definitionId: text(row.definitionId), pointId: text(row.pointId), pointLabel: text(row.pointLabel),
      designRevision: finite(row.designRevision), horizontalCrs: text(row.horizontalCrs),
      definitionCrs: optionalText(row.definitionCrs), deviceCrs: optionalText(row.deviceCrs), verticalDatum: optionalText(row.verticalDatum),
      capturedAt: optionalText(row.capturedAt), design: coordinates(row.design), capturedDesign: coordinates(row.capturedDesign),
      observed: coordinates(row.observed), reportedAccuracyM: row.reportedAccuracyM === null ? null : finite(row.reportedAccuracyM),
      profile: savedProfile,
    }, savedTolerance)
    if (row.horizontalCrsEvidence !== snapshot.horizontalCrsEvidence || row.captureTimeSource !== snapshot.captureTimeSource
      || tolerance.horizontalM !== snapshot.tolerance.horizontalM || tolerance.verticalM !== snapshot.tolerance.verticalM
      || tolerance.version !== snapshot.tolerance.version || tolerance.source !== snapshot.tolerance.source) return null
    const recorded = object(row.assessment)
    if (recorded.result !== snapshot.assessment.result || typeof recorded.message !== 'string') return null
    for (const key of ['dE', 'dN', 'dZ', 'moveE', 'moveN', 'moveZ', 'horizontalErrorM', 'verticalErrorM', 'distanceToTargetM'] as const) {
      const actual = snapshot.assessment[key]
      if (actual === null ? recorded[key] !== null : typeof recorded[key] !== 'number' || !Number.isFinite(recorded[key]) || Math.abs(actual - recorded[key]) > 1e-12) return null
    }
    snapshot.assessment.message = recorded.message
    return snapshot
  } catch { return null }
}
