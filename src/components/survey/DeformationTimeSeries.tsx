'use client';

import React, { useState, useMemo } from 'react';

export interface EpochData {
  date: string;            // ISO date
  label: string;           // e.g., 'Epoch 1', 'Survey 2024-03'
  points: Array<{
    id: string;            // Monitoring point ID
    easting: number;
    northing: number;
    elevation?: number;
  }>;
}

export interface DeformationTimeSeriesProps {
  /** Reference epoch (first survey) */
  referenceEpoch: EpochData;
  /** Subsequent monitoring epochs (chronological order) */
  monitoringEpochs: EpochData[];
  /** Displacement alert threshold in mm */
  alertThresholdMm?: number;
  /** Whether to show elevation component */
  showElevation?: boolean;
}

type Tab = 'timeseries' | 'vectors' | 'summary';

interface PointDisplacement {
  id: string;
  epochDate: string;
  epochLabel: string;
  daysSinceRef: number;
  deltaE: number;
  deltaN: number;
  deltaH?: number;
  total2D: number;
  total3D?: number;
}

interface PointStats {
  id: string;
  totalDisplacementMm: number;
  velocityMmPerDay: number;
  velocityMmPerEpoch: number;
  directionDeg: number;
  isAccelerating: boolean;
  exceedsThreshold: boolean;
}

/**
 * Calculates Euclidean distance between two points in 2D
 */
function distance2D(e1: number, n1: number, e2: number, n2: number): number {
  return Math.sqrt(Math.pow(e2 - e1, 2) + Math.pow(n2 - n1, 2));
}

/**
 * Calculates azimuth in degrees (0-360) from North
 */
function calculateAzimuth(e1: number, n1: number, e2: number, n2: number): number {
  const de = e2 - e1;
  const dn = n2 - n1;
  let az = Math.atan2(de, dn) * (180 / Math.PI);
  if (az < 0) az += 360;
  return az;
}

const COLORS = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
];

export function DeformationTimeSeries({
  referenceEpoch,
  monitoringEpochs,
  alertThresholdMm = 10,
  showElevation = false,
}: DeformationTimeSeriesProps) {
  const [activeTab, setActiveTab] = useState<Tab>('timeseries');
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [hoveredEpochIdx, setHoveredEpochIdx] = useState<number | null>(null);

  // Compute all displacements
  const { allEpochs, displacementsByPoint, pointStats, alerts } = useMemo(() => {
    const all = [referenceEpoch, ...monitoringEpochs];
    const refDate = new Date(referenceEpoch.date).getTime();
    
    const byPoint: Record<string, PointDisplacement[]> = {};
    
    // Initialize tracking maps
    referenceEpoch.points.forEach(p => {
      byPoint[p.id] = [{
        id: p.id,
        epochDate: referenceEpoch.date,
        epochLabel: referenceEpoch.label,
        daysSinceRef: 0,
        deltaE: 0,
        deltaN: 0,
        deltaH: 0,
        total2D: 0,
        total3D: 0
      }];
    });

    const activeAlerts = {
      thresholdExceeded: false,
      accelerating: false
    };

    const statsMap: Record<string, PointStats> = {};

    all.forEach((epoch, epochIdx) => {
      if (epochIdx === 0) return; // Skip ref
      
      const epochTime = new Date(epoch.date).getTime();
      const days = (epochTime - refDate) / (1000 * 60 * 60 * 24);

      epoch.points.forEach(p => {
        const refP = referenceEpoch.points.find(rp => rp.id === p.id);
        if (!refP) return;

        if (!byPoint[p.id]) return;

        // Coordinates are typically in meters in surveying, convert differences to mm
        const deltaE = (p.easting - refP.easting) * 1000;
        const deltaN = (p.northing - refP.northing) * 1000;
        const deltaH = (p.elevation !== undefined && refP.elevation !== undefined) 
          ? (p.elevation - refP.elevation) * 1000 
          : undefined;

        const total2D = distance2D(0, 0, deltaE, deltaN);
        const total3D = deltaH !== undefined ? Math.sqrt(total2D * total2D + deltaH * deltaH) : undefined;

        const displacement: PointDisplacement = {
          id: p.id,
          epochDate: epoch.date,
          epochLabel: epoch.label,
          daysSinceRef: days,
          deltaE,
          deltaN,
          deltaH,
          total2D,
          total3D
        };
        
        byPoint[p.id].push(displacement);
      });
    });

    // Compute stats
    Object.keys(byPoint).forEach(id => {
      const disp = byPoint[id];
      if (disp.length < 2) return;
      
      const latest = disp[disp.length - 1];
      const prev = disp[disp.length - 2];
      const firstDisp = disp[1];
      
      const totalDisp = showElevation && latest.total3D !== undefined ? latest.total3D : latest.total2D;
      
      // Velocity per day
      const velPerDay = latest.daysSinceRef > 0 ? totalDisp / latest.daysSinceRef : 0;
      
      // Velocity per epoch
      const velPerEpoch = totalDisp / (disp.length - 1);
      
      const direction = calculateAzimuth(0, 0, latest.deltaE, latest.deltaN);
      
      const exceedsThreshold = totalDisp > alertThresholdMm;
      if (exceedsThreshold) activeAlerts.thresholdExceeded = true;
      
      // Acceleration check (simple diff of rates)
      let isAccelerating = false;
      if (disp.length > 2) {
        const latestRate = (latest.total2D - prev.total2D) / Math.max(1, (latest.daysSinceRef - prev.daysSinceRef));
        const prevRate = (prev.total2D - firstDisp.total2D) / Math.max(1, (prev.daysSinceRef - firstDisp.daysSinceRef));
        if (latestRate > prevRate * 1.5 && latestRate > 0.1) { // 50% increase and significant
          isAccelerating = true;
          activeAlerts.accelerating = true;
        }
      }

      statsMap[id] = {
        id,
        totalDisplacementMm: totalDisp,
        velocityMmPerDay: velPerDay,
        velocityMmPerEpoch: velPerEpoch,
        directionDeg: direction,
        isAccelerating,
        exceedsThreshold
      };
    });

    return { allEpochs: all, displacementsByPoint: byPoint, pointStats: statsMap, alerts: activeAlerts };
  }, [referenceEpoch, monitoringEpochs, alertThresholdMm, showElevation]);

  const pointIds = Object.keys(displacementsByPoint);

  // SVG Chart Setup
  const chartWidth = 800;
  const chartHeight = 400;
  const margin = { top: 40, right: 120, bottom: 60, left: 60 };
  const innerWidth = chartWidth - margin.left - margin.right;
  const innerHeight = chartHeight - margin.top - margin.bottom;

  // Chart Scaling
  const maxDays = Math.max(...pointIds.map(id => {
    const d = displacementsByPoint[id];
    return d[d.length - 1]?.daysSinceRef || 0;
  }));
  
  let maxDisp = Math.max(alertThresholdMm, ...pointIds.map(id => {
    const d = displacementsByPoint[id];
    return Math.max(...d.map(dp => (showElevation && dp.total3D !== undefined) ? dp.total3D : dp.total2D));
  }));
  maxDisp = Math.ceil(maxDisp * 1.2); // 20% padding

  const xScale = (days: number) => margin.left + (maxDays > 0 ? (days / maxDays) * innerWidth : innerWidth / 2);
  const yScale = (val: number) => margin.top + innerHeight - (maxDisp > 0 ? (val / maxDisp) * innerHeight : 0);

  // Vector Plan View Setup
  const planWidth = 800;
  const planHeight = 400;
  const pMargin = 40;
  
  // Find min/max E,N for plan view bounds
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  referenceEpoch.points.forEach(p => {
    if (p.easting < minE) minE = p.easting;
    if (p.easting > maxE) maxE = p.easting;
    if (p.northing < minN) minN = p.northing;
    if (p.northing > maxN) maxN = p.northing;
  });
  
  const spanE = maxE - minE;
  const spanN = maxN - minN;
  
  // Ensure we don't divide by zero if only one point
  const eScaleFactor = spanE > 0 ? (planWidth - pMargin * 2) / spanE : 1;
  const nScaleFactor = spanN > 0 ? (planHeight - pMargin * 2) / spanN : 1;
  const planScale = Math.min(eScaleFactor, nScaleFactor) * 0.9;
  
  const planCx = minE + spanE / 2;
  const planCy = minN + spanN / 2;
  
  const toPlanX = (e: number) => planWidth / 2 + (e - planCx) * planScale;
  const toPlanY = (n: number) => planHeight / 2 - (n - planCy) * planScale;

  // Vector exaggeration factor (displacements are in mm, coords in m)
  // We want to see vectors clearly, maybe 10mm -> 50px
  const vectorExaggeration = 5;

  return (
    <div className="bg-gray-950 text-white p-6 rounded-lg shadow-xl w-full flex flex-col gap-6">
      
      {/* Header and Alerts */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-2">Deformation Time Series</h2>
        <div className="flex flex-col gap-2">
          {alerts.thresholdExceeded && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded flex items-center gap-2">
              <span className="font-bold">⚠️ CRITICAL:</span>
              <span>One or more monitoring points have exceeded the {alertThresholdMm}mm displacement threshold.</span>
            </div>
          )}
          {alerts.accelerating && (
            <div className="bg-amber-900/50 border border-amber-500 text-amber-200 px-4 py-2 rounded flex items-center gap-2">
              <span className="font-bold">⚠️ WARNING:</span>
              <span>Acceleration detected in deformation rates. Suggest increasing observation frequency.</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {(['timeseries', 'vectors', 'summary'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-6 py-3 text-sm font-medium capitalize transition-colors
              ${activeTab === t 
                ? 'border-b-2 border-blue-500 text-blue-400' 
                : 'text-gray-400 hover:text-gray-200'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="relative min-h-[400px] overflow-x-auto">
        
        {/* Time Series Chart */}
        {activeTab === 'timeseries' && (
          <div className="min-w-[800px]">
            <svg width={chartWidth} height={chartHeight} className="bg-gray-900 rounded border border-gray-800 font-sans">
              
              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map(tick => {
                const y = margin.top + tick * innerHeight;
                const val = maxDisp - (tick * maxDisp);
                return (
                  <g key={`y-${tick}`}>
                    <line x1={margin.left} y1={y} x2={chartWidth - margin.right} y2={y} stroke="#374151" strokeDasharray={tick === 1 ? "" : "4,4"} />
                    <text x={margin.left - 10} y={y} fill="#9ca3af" fontSize="12" textAnchor="end" dominantBaseline="middle">
                      {val.toFixed(1)} mm
                    </text>
                  </g>
                );
              })}
              
              {/* Alert Threshold Line */}
              {alertThresholdMm <= maxDisp && (
                <g>
                  <line 
                    x1={margin.left} 
                    y1={yScale(alertThresholdMm)} 
                    x2={chartWidth - margin.right} 
                    y2={yScale(alertThresholdMm)} 
                    stroke="#ef4444" 
                    strokeWidth="2" 
                    strokeDasharray="6,4" 
                  />
                  <text x={chartWidth - margin.right + 10} y={yScale(alertThresholdMm)} fill="#ef4444" fontSize="12" dominantBaseline="middle">
                    Threshold
                  </text>
                </g>
              )}

              {/* Epoch X Axis labels */}
              {allEpochs.map((ep, idx) => {
                if (idx === 0) return null; // Or handle ref epoch separately
                const disp = displacementsByPoint[pointIds[0]]?.[idx];
                if (!disp) return null;
                const x = xScale(disp.daysSinceRef);
                return (
                  <g key={`x-${idx}`}>
                    <line x1={x} y1={chartHeight - margin.bottom} x2={x} y2={chartHeight - margin.bottom + 5} stroke="#6b7280" />
                    <text x={x} y={chartHeight - margin.bottom + 20} fill="#9ca3af" fontSize="10" textAnchor="middle" transform={`rotate(-45, ${x}, ${chartHeight - margin.bottom + 20})`}>
                      {ep.label}
                    </text>
                  </g>
                );
              })}

              {/* Data Lines */}
              {pointIds.map((id, pIdx) => {
                const color = COLORS[pIdx % COLORS.length];
                const isHovered = hoveredPointId === id;
                const opacity = hoveredPointId ? (isHovered ? 1 : 0.2) : 1;
                const strokeWidth = isHovered ? 3 : 2;
                
                const d = displacementsByPoint[id];
                const points = d.map(dp => {
                  const val = showElevation && dp.total3D !== undefined ? dp.total3D : dp.total2D;
                  return `${xScale(dp.daysSinceRef)},${yScale(val)}`;
                }).join(' L ');

                return (
                  <g key={id} opacity={opacity}>
                    <path d={`M ${points}`} fill="none" stroke={color} strokeWidth={strokeWidth} />
                    {d.map((dp, idx) => {
                      const val = showElevation && dp.total3D !== undefined ? dp.total3D : dp.total2D;
                      const cx = xScale(dp.daysSinceRef);
                      const cy = yScale(val);
                      return (
                        <circle 
                          key={`${id}-${idx}`} 
                          cx={cx} 
                          cy={cy} 
                          r={isHovered ? 6 : 4} 
                          fill={color} 
                          stroke="#111827" 
                          strokeWidth="2"
                          onMouseEnter={() => { setHoveredPointId(id); setHoveredEpochIdx(idx); }}
                          onMouseLeave={() => { setHoveredPointId(null); setHoveredEpochIdx(null); }}
                          className="cursor-pointer transition-all"
                        />
                      );
                    })}
                  </g>
                );
              })}

              {/* Legend */}
              <g transform={`translate(${chartWidth - margin.right + 20}, ${margin.top})`}>
                <text fill="#e5e7eb" fontSize="14" fontWeight="bold" y="-10">Points</text>
                {pointIds.map((id, pIdx) => (
                  <g key={`leg-${id}`} transform={`translate(0, ${pIdx * 20})`}
                     onMouseEnter={() => setHoveredPointId(id)}
                     onMouseLeave={() => setHoveredPointId(null)}
                     className="cursor-pointer"
                  >
                    <line x1="0" y1="0" x2="15" y2="0" stroke={COLORS[pIdx % COLORS.length]} strokeWidth="3" />
                    <text x="25" y="0" fill={hoveredPointId === id ? "#fff" : "#9ca3af"} fontSize="12" dominantBaseline="middle">
                      {id}
                    </text>
                  </g>
                ))}
              </g>

              {/* Tooltip */}
              {hoveredPointId && hoveredEpochIdx !== null && (
                <g>
                  {(() => {
                    const dp = displacementsByPoint[hoveredPointId][hoveredEpochIdx];
                    const val = showElevation && dp.total3D !== undefined ? dp.total3D : dp.total2D;
                    const x = xScale(dp.daysSinceRef);
                    const y = yScale(val);
                    return (
                      <g transform={`translate(${x > chartWidth / 2 ? x - 130 : x + 15}, ${y - 40})`}>
                        <rect width="120" height="70" fill="#1f2937" stroke="#374151" rx="4" opacity="0.95" />
                        <text x="10" y="20" fill="#fff" fontSize="12" fontWeight="bold">{hoveredPointId}</text>
                        <text x="10" y="38" fill="#d1d5db" fontSize="10">{dp.epochLabel}</text>
                        <text x="10" y="55" fill="#3b82f6" fontSize="12" fontWeight="bold">{val.toFixed(2)} mm</text>
                      </g>
                    );
                  })()}
                </g>
              )}
            </svg>
          </div>
        )}

        {/* Velocity Vectors (Plan View) */}
        {activeTab === 'vectors' && (
          <div className="min-w-[800px]">
            <svg width={planWidth} height={planHeight} className="bg-gray-900 rounded border border-gray-800 font-sans">
              {/* Draw reference points and latest vectors */}
              {referenceEpoch.points.map((p, idx) => {
                const px = toPlanX(p.easting);
                const py = toPlanY(p.northing);
                const stats = pointStats[p.id];
                const d = displacementsByPoint[p.id];
                const latest = d?.[d.length - 1];

                if (!latest || !stats) return null;

                // Color based on velocity
                let vecColor = "#10b981"; // green
                if (stats.exceedsThreshold) vecColor = "#ef4444"; // red
                else if (stats.isAccelerating || stats.totalDisplacementMm > alertThresholdMm * 0.5) vecColor = "#f59e0b"; // yellow

                // Vector endpoint (exaggerated)
                // Note: deltaE is mm, deltaN is mm. SVG y is flipped.
                const vx = px + (latest.deltaE * vectorExaggeration);
                const vy = py - (latest.deltaN * vectorExaggeration);

                return (
                  <g key={p.id}>
                    {/* Reference Point Marker */}
                    <path d={`M ${px-4} ${py-4} L ${px+4} ${py+4} M ${px+4} ${py-4} L ${px-4} ${py+4}`} stroke="#6b7280" strokeWidth="2" />
                    
                    {/* Displacement Vector */}
                    {latest.total2D > 0.5 && (
                      <g>
                        <line x1={px} y1={py} x2={vx} y2={vy} stroke={vecColor} strokeWidth="2" markerEnd={`url(#arrow-${p.id})`} />
                        <defs>
                          <marker id={`arrow-${p.id}`} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                            <path d="M0,0 L0,6 L9,3 z" fill={vecColor} />
                          </marker>
                        </defs>
                      </g>
                    )}

                    {/* Label */}
                    <text x={px + 8} y={py - 8} fill="#d1d5db" fontSize="12">{p.id}</text>
                  </g>
                );
              })}
              
              <g transform="translate(20, 20)">
                <text fill="#fff" fontSize="14" fontWeight="bold">Vector Plan View</text>
                <text fill="#9ca3af" fontSize="12" y="20">Exaggeration: {vectorExaggeration}x</text>
                <line x1="0" y1="40" x2="30" y2="40" stroke="#10b981" strokeWidth="2" />
                <text x="40" y="44" fill="#9ca3af" fontSize="12">Stable / Slow</text>
                <line x1="0" y1="60" x2="30" y2="60" stroke="#f59e0b" strokeWidth="2" />
                <text x="40" y="64" fill="#9ca3af" fontSize="12">Moderate / Accel</text>
                <line x1="0" y1="80" x2="30" y2="80" stroke="#ef4444" strokeWidth="2" />
                <text x="40" y="84" fill="#9ca3af" fontSize="12">Exceeds Threshold</text>
              </g>

              {/* North Arrow */}
              <g transform={`translate(${planWidth - 40}, 40)`}>
                <line x1="0" y1="20" x2="0" y2="0" stroke="#fff" strokeWidth="2" markerEnd="url(#n-arrow)" />
                <text x="0" y="-10" fill="#fff" fontSize="14" fontWeight="bold" textAnchor="middle">N</text>
                <defs>
                  <marker id="n-arrow" markerWidth="10" markerHeight="10" refX="5" refY="0" orient="auto">
                    <path d="M0,10 L5,0 L10,10 z" fill="#fff" />
                  </marker>
                </defs>
              </g>
            </svg>
          </div>
        )}

        {/* Statistical Summary */}
        {activeTab === 'summary' && (
          <div className="overflow-hidden rounded border border-gray-800">
            <table className="min-w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-900 text-gray-300 uppercase tracking-wider border-b border-gray-800">
                <tr>
                  <th className="px-6 py-4">Point ID</th>
                  <th className="px-6 py-4">Total Disp. (mm)</th>
                  <th className="px-6 py-4">Velocity (mm/ep)</th>
                  <th className="px-6 py-4">Direction (°)</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-950">
                {pointIds.map(id => {
                  const stats = pointStats[id];
                  if (!stats) return null;
                  return (
                    <tr key={id} className={stats.exceedsThreshold ? 'bg-red-950/20' : 'hover:bg-gray-900/50'}>
                      <td className="px-6 py-4 font-medium text-white">{id}</td>
                      <td className={`px-6 py-4 font-mono ${stats.exceedsThreshold ? 'text-red-400 font-bold' : 'text-gray-300'}`}>
                        {stats.totalDisplacementMm.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 font-mono text-gray-300">
                        {stats.velocityMmPerEpoch.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 font-mono text-gray-300">
                        {stats.directionDeg.toFixed(1)}°
                      </td>
                      <td className="px-6 py-4 flex gap-2">
                        {stats.exceedsThreshold && (
                          <span className="px-2 py-1 bg-red-900/50 text-red-300 rounded text-xs border border-red-800">
                            Exceeded
                          </span>
                        )}
                        {stats.isAccelerating && (
                          <span className="px-2 py-1 bg-amber-900/50 text-amber-300 rounded text-xs border border-amber-800">
                            Accelerating
                          </span>
                        )}
                        {!stats.exceedsThreshold && !stats.isAccelerating && (
                          <span className="px-2 py-1 bg-green-900/50 text-green-300 rounded text-xs border border-green-800">
                            Stable
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}
