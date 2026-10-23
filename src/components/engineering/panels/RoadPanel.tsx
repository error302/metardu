'use client';

import { useState, useMemo } from 'react';
import { ENGINEERING_QA, type EngineeringSubtype, computeHorizontalCurve, computeVerticalCurve, crossSectionCutFill, prismoidalVolume } from '@/lib/engine/engineering';

type AlignmentPointDraft = { chainage: string; easting: string; northing: string; elevation: string }
type HorizontalCurveDraft = { radius: string; delta: string; piChainage: string }
type VerticalCurveDraft = { pvIChainage: string; pvIElevation: string; gradeIn: string; gradeOut: string; length: string }

interface EngineeringPanelProps {
  projectId: string;
  subtype: EngineeringSubtype;
}

export function RoadPanel({ projectId: _projectId, subtype: _subtype }: EngineeringPanelProps) {
  const [activeTab, setActiveTab] = useState<'alignment' | 'horizontal' | 'vertical' | 'cross' | 'earthworks' | 'settingout'>('alignment');
  const [formError, setFormError] = useState('');
  const qa = ENGINEERING_QA.road;

  const [alignment, setAlignment] = useState<Array<{ chainage: number; easting: number; northing: number; elevation?: number; label: string }>>([]);
  const [horizontalCurves, setHorizontalCurves] = useState<Array<{ radius: number; delta: number; piChainage: number }>>([]);
  const [verticalCurves, setVerticalCurves] = useState<Array<{ pvIChainage: number; pvIElevation: number; gradeIn: number; gradeOut: number; length: number }>>([]);
  const [alignmentDraft, setAlignmentDraft] = useState<AlignmentPointDraft>({ chainage: '', easting: '', northing: '', elevation: '' });
  const [horizontalDraft, setHorizontalDraft] = useState<HorizontalCurveDraft>({ radius: '', delta: '', piChainage: '' });
  const [verticalDraft, setVerticalDraft] = useState<VerticalCurveDraft>({ pvIChainage: '', pvIElevation: '', gradeIn: '', gradeOut: '', length: '' });
  const [crossSections] = useState<Array<{ chainage: number; designLevel: number; levels: Array<{ offset: number; elevation: number }> }>>([]);

  const addAlignmentPoint = () => {
    const values = [alignmentDraft.chainage, alignmentDraft.easting, alignmentDraft.northing].map(Number);
    if (values.some((value, i) => !alignmentDraft[['chainage', 'easting', 'northing'][i] as keyof AlignmentPointDraft].trim() || !Number.isFinite(value))) {
      setFormError('Enter a finite chainage, easting, and northing from the survey data.');
      return;
    }
    const [chainage, easting, northing] = values;
    if (chainage < 0 || (alignment.length && chainage <= alignment[alignment.length - 1].chainage)) {
      setFormError('Chainage must be non-negative and greater than the previous alignment point.');
      return;
    }
    const elevation = alignmentDraft.elevation.trim() === '' ? undefined : Number(alignmentDraft.elevation);
    if (elevation !== undefined && !Number.isFinite(elevation)) {
      setFormError('Elevation must be finite or left blank.');
      return;
    }
    setAlignment([...alignment, { chainage, easting, northing, elevation, label: `P${alignment.length + 1}` }]);
    setAlignmentDraft({ chainage: '', easting: '', northing: '', elevation: '' });
    setFormError('');
  };

  const addHorizontalCurve = () => {
    const { radius, delta, piChainage } = horizontalDraft;
    const r = Number(radius), d = Number(delta), pi = Number(piChainage);
    if ([radius, delta, piChainage].some(v => !v.trim()) || ![r, d, pi].every(Number.isFinite) || r <= 0 || d <= 0 || d >= 180 || pi < 0) {
      setFormError('Enter radius > 0, deflection between 0° and 180°, and a non-negative PI chainage.');
      return;
    }
    try {
      const curve = computeHorizontalCurve(r, d, pi);
      if (curve.pcChainage < 0) {
        setFormError('This curve places the PC before chainage zero. Check the entered PI chainage and geometry.');
        return;
      }
      if (horizontalCurves.some(existing => {
        const prior = computeHorizontalCurve(existing.radius, existing.delta, existing.piChainage);
        return curve.pcChainage < prior.ptChainage && curve.ptChainage > prior.pcChainage;
      })) {
        setFormError('This curve overlaps a curve already in the list.');
        return;
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Review the horizontal curve geometry.');
      return;
    }
    setHorizontalCurves([...horizontalCurves, { radius: r, delta: d, piChainage: pi }]);
    setHorizontalDraft({ radius: '', delta: '', piChainage: '' });
    setFormError('');
  };

  const addVerticalCurve = () => {
    const { pvIChainage, pvIElevation, gradeIn, gradeOut, length } = verticalDraft;
    const strings = [pvIChainage, pvIElevation, gradeIn, gradeOut, length];
    const [pvi, elev, g1, g2, len] = strings.map(Number);
    if (strings.some(v => !v.trim()) || ![pvi, elev, g1, g2, len].every(Number.isFinite) || pvi < 0 || len <= 0 || pvi < len / 2) {
      setFormError('Enter finite PVI data and a positive curve length that keeps the PVC at or after chainage zero.');
      return;
    }
    try {
      computeVerticalCurve(pvi, elev, g1, g2, len);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Review the vertical curve geometry.');
      return;
    }
    setVerticalCurves([...verticalCurves, { pvIChainage: pvi, pvIElevation: elev, gradeIn: g1, gradeOut: g2, length: len }]);
    setVerticalDraft({ pvIChainage: '', pvIElevation: '', gradeIn: '', gradeOut: '', length: '' });
    setFormError('');
  };

  const computedHorizontal = useMemo(() => {
    return horizontalCurves.map(c => computeHorizontalCurve(c.radius, c.delta, c.piChainage));
  }, [horizontalCurves]);

  const computedVertical = useMemo(() => {
    return verticalCurves.map(v => computeVerticalCurve(v.pvIChainage, v.pvIElevation, v.gradeIn, v.gradeOut, v.length));
  }, [verticalCurves]);

  const earthworks = useMemo(() => {
    let totalCut = 0;
    let totalFill = 0;
    crossSections.forEach((cs, i) => {
      if (i > 0) {
        const prev = crossSections[i - 1];
        const { cutArea, fillArea } = crossSectionCutFill(cs.designLevel, cs.levels);
        const dist = cs.chainage - prev.chainage;
        totalCut += prismoidalVolume(cutArea, crossSectionCutFill(prev.designLevel, prev.levels).cutArea, dist);
        totalFill += prismoidalVolume(fillArea, crossSectionCutFill(prev.designLevel, prev.levels).fillArea, dist);
      }
    });
    return { totalCut, totalFill, net: totalCut - totalFill };
  }, [crossSections]);

  const tabs = [
    { id: 'alignment', label: 'Alignment' },
    { id: 'horizontal', label: 'Horizontal Curves' },
    { id: 'vertical', label: 'Vertical Curves' },
    { id: 'cross', label: 'Cross Sections' },
    { id: 'earthworks', label: 'Earthworks' },
    { id: 'settingout', label: 'Setting Out' },
  ] as const;

  return (
    <div className="p-4">
      <div className="mb-4 p-3 bg-zinc-800 rounded-lg">
        <div className="text-sm text-zinc-400">QA Standards</div>
        <div className="flex gap-4 mt-1 text-xs">
          <span>Traverse: 1:{qa.traversePrecision}</span>
          <span>Levelling: {qa.levellingClosureMM}</span>
          <span>Angular: {qa.angularClosureSec}</span>
          <span>Horizontal: ±{qa.horizontalClosureMM}mm/km</span>
        </div>
      </div>
      <p className="mb-4 text-xs text-amber-200/80">This legacy panel keeps inputs in the current page only. It does not save them to the project. Confirm the project CRS and approved design basis before using any calculated values for construction.</p>
      {formError && <p role="alert" className="mb-4 rounded border border-red-700 bg-red-950/50 p-3 text-sm text-red-200">{formError}</p>}

      <div className="flex border-b border-zinc-700 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 text-sm ${activeTab === tab.id ? 'text-amber-500 border-b-2 border-amber-500' : 'text-zinc-400'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'alignment' && (
        <div>
          <div className="text-lg font-medium mb-3">Alignment Points</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-700">
                <th className="text-left py-2">Chainage</th>
                <th className="text-left py-2">Easting</th>
                <th className="text-left py-2">Northing</th>
                <th className="text-left py-2">Elevation</th>
                <th className="text-left py-2">Label</th>
              </tr>
            </thead>
            <tbody>
              {alignment.map((pt) => (
                <tr key={pt.label} className="border-b border-zinc-800">
                  <td className="py-2">{pt.chainage.toFixed(3)}</td>
                  <td className="py-2">{pt.easting.toFixed(3)}</td>
                  <td className="py-2">{pt.northing.toFixed(3)}</td>
                  <td className="py-2">{pt.elevation?.toFixed(3) || '-'}</td>
                  <td className="py-2">{pt.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {crossSections.length === 0 && <p className="mt-3 text-sm text-zinc-400">No cross-section survey or design levels are loaded. Import/enter real section data in Quick Compute to calculate areas.</p>}
          {alignment.length === 0 && <p className="mt-3 text-sm text-zinc-400">No surveyed alignment points entered.</p>}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
            {([
              ['chainage', 'Chainage (m)', alignmentDraft.chainage],
              ['easting', 'Easting', alignmentDraft.easting],
              ['northing', 'Northing', alignmentDraft.northing],
              ['elevation', 'Elevation (optional)', alignmentDraft.elevation],
            ] as const).map(([field, label, value]) => (
              <input key={field} type="number" step="any" aria-label={label} placeholder={label} value={value}
                onChange={e => setAlignmentDraft(current => ({ ...current, [field]: e.target.value }))}
                className="min-w-0 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm" />
            ))}
            <button onClick={addAlignmentPoint} className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 rounded">Add surveyed point</button>
          </div>
        </div>
      )}

      {activeTab === 'horizontal' && (
        <div>
          <div className="text-lg font-medium mb-3">Horizontal Curves</div>
          {computedHorizontal.map((curve, i) => (
            <div key={`${curve}-${i}`} className="mb-4 p-3 bg-zinc-800 rounded-lg">
              <div className="text-sm text-amber-500 mb-2">Curve {i + 1}</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-zinc-400">Radius:</span> {horizontalCurves[i].radius}m</div>
                <div><span className="text-zinc-400">Δ:</span> {horizontalCurves[i].delta.toFixed(2)}°</div>
                <div><span className="text-zinc-400">T (Tangent):</span> {curve.tangentLength.toFixed(3)}m</div>
                <div><span className="text-zinc-400">L (Curve):</span> {curve.curveLength.toFixed(3)}m</div>
                <div><span className="text-zinc-400">E (External):</span> {curve.externalDistance.toFixed(3)}m</div>
                <div><span className="text-zinc-400">M (Mid-ord):</span> {curve.midOrdinate.toFixed(3)}m</div>
                <div><span className="text-zinc-400">LC (Long Chord):</span> {curve.longChord.toFixed(3)}m</div>
                <div><span className="text-zinc-400">PC:</span> {curve.pcChainage.toFixed(3)}m</div>
                <div><span className="text-zinc-400">PT:</span> {curve.ptChainage.toFixed(3)}m</div>
              </div>
              <p className="mt-2 text-xs text-amber-200/80">Geometry only. Design standards and the coordinate reference are not verified.</p>
            </div>
          ))}
          {horizontalCurves.length === 0 && <p className="text-sm text-zinc-400">Enter the radius, deflection and PI chainage.</p>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
            {([
              ['radius', 'Radius (m)', horizontalDraft.radius],
              ['delta', 'Deflection (°)', horizontalDraft.delta],
              ['piChainage', 'PI chainage (m)', horizontalDraft.piChainage],
            ] as const).map(([field, label, value]) => (
              <input key={field} type="number" step="any" aria-label={label} placeholder={label} value={value}
                onChange={e => setHorizontalDraft(current => ({ ...current, [field]: e.target.value }))}
                className="min-w-0 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm" />
            ))}
            <button onClick={addHorizontalCurve} className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 rounded">Calculate curve</button>
          </div>
        </div>
      )}

      {activeTab === 'vertical' && (
        <div>
          <div className="text-lg font-medium mb-3">Vertical Curves</div>
          {computedVertical.map((vc, i) => (
            <div key={`${vc}-${i}`} className="mb-4 p-3 bg-zinc-800 rounded-lg">
              <div className="text-sm text-amber-500 mb-2">Vertical Curve {i + 1}</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-zinc-400">PVI Chainage:</span> {verticalCurves[i].pvIChainage.toFixed(3)}m</div>
                <div><span className="text-zinc-400">PVI Elevation:</span> {verticalCurves[i].pvIElevation.toFixed(3)}m</div>
                <div><span className="text-zinc-400">Grade In:</span> {verticalCurves[i].gradeIn.toFixed(2)}%</div>
                <div><span className="text-zinc-400">Grade Out:</span> {verticalCurves[i].gradeOut.toFixed(2)}%</div>
                <div><span className="text-zinc-400">Length:</span> {verticalCurves[i].length.toFixed(3)}m</div>
                <div><span className="text-zinc-400">Profile:</span> {vc.curveType}</div>
                <div><span className="text-zinc-400">PVC chainage / level:</span> {vc.pvcChainage.toFixed(3)}m / {vc.pvcElevation.toFixed(3)}m</div>
                <div><span className="text-zinc-400">PVT chainage / level:</span> {vc.pvtChainage.toFixed(3)}m / {vc.pvtElevation.toFixed(3)}m</div>
                {vc.highLowPoint && (
                  <>
                    <div><span className="text-zinc-400">HL Chainage:</span> {vc.highLowPoint.chainage.toFixed(3)}m</div>
                    <div><span className="text-zinc-400">HL Elevation:</span> {vc.highLowPoint.elevation.toFixed(3)}m</div>
                  </>
                )}
              </div>
              <p className="mt-2 text-xs text-amber-200/80">Geometry only. Design standards are not assessed; the supplied level has no verified vertical datum.</p>
            </div>
          ))}
          {verticalCurves.length === 0 && <p className="text-sm text-zinc-400">Enter the PVI, percent grades and explicit curve length.</p>}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-3">
            {([
              ['pvIChainage', 'PVI chainage (m)', verticalDraft.pvIChainage],
              ['pvIElevation', 'PVI elevation (m)', verticalDraft.pvIElevation],
              ['gradeIn', 'Incoming grade (%)', verticalDraft.gradeIn],
              ['gradeOut', 'Outgoing grade (%)', verticalDraft.gradeOut],
              ['length', 'Curve length (m)', verticalDraft.length],
            ] as const).map(([field, label, value]) => (
              <input key={field} type="number" step="any" aria-label={label} placeholder={label} value={value}
                onChange={e => setVerticalDraft(current => ({ ...current, [field]: e.target.value }))}
                className="min-w-0 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm" />
            ))}
            <button onClick={addVerticalCurve} className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 rounded">Calculate curve</button>
          </div>
        </div>
      )}

      {activeTab === 'cross' && (
        <div>
          <div className="text-lg font-medium mb-3">Cross Sections</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-700">
                <th className="text-left py-2">Chainage</th>
                <th className="text-left py-2">Design Level</th>
                <th className="text-left py-2">Cut (m²)</th>
                <th className="text-left py-2">Fill (m²)</th>
              </tr>
            </thead>
            <tbody>
              {crossSections.map((cs, i) => {
                const { cutArea, fillArea } = crossSectionCutFill(cs.designLevel, cs.levels);
                return (
                  <tr key={`${cs}-${i}`} className="border-b border-zinc-800">
                    <td className="py-2">{cs.chainage.toFixed(3)}</td>
                    <td className="py-2">{cs.designLevel.toFixed(3)}</td>
                    <td className="py-2">{cutArea.toFixed(3)}</td>
                    <td className="py-2">{fillArea.toFixed(3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'earthworks' && (
        <div>
          <div className="text-lg font-medium mb-3">Earthworks Summary</div>
          {crossSections.length < 2 ? <p className="rounded border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">Earthworks quantities need at least two ordered cross-sections with surveyed ground points and design levels. No zero-volume result is implied.</p> : <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="text-sm text-zinc-400">Total Cut</div>
              <div className="text-xl text-red-400">{earthworks.totalCut.toFixed(2)} m³</div>
            </div>
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="text-sm text-zinc-400">Total Fill</div>
              <div className="text-xl text-blue-400">{earthworks.totalFill.toFixed(2)} m³</div>
            </div>
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="text-sm text-zinc-400">Net</div>
              <div className={`text-xl ${earthworks.net >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {earthworks.net.toFixed(2)} m³
              </div>
            </div>
          </div>}
        </div>
      )}

      {activeTab === 'settingout' && (
        <div>
          <div className="text-lg font-medium mb-3">Setting Out</div>
          <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 text-sm">
            <p className="text-zinc-300">The point inputs previously shown here did not calculate or validate a stakeout. Use the functional set-out calculator, which requires an instrument station, backsight, target heights, and explicit project coordinates.</p>
            <a className="mt-3 inline-flex rounded bg-amber-600 px-3 py-2 font-medium text-white hover:bg-amber-700" href={`/project/${encodeURIComponent(_projectId)}/engineering?tab=setting_out`}>Open functional set-out calculator</a>
          </div>
        </div>
      )}
    </div>
  );
}

export default RoadPanel;
