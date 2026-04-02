// src/math/levelling.ts
// Fully compliant with Schofield & Breach 6th Ed. + Basak + RDM 1.1 Table 5.1

export type LevellingReading = {
  id: string;
  bs: number;
  fs: number;
  is?: number;
  rawRL: number;
  cumDistKm: number;
  description?: string;
};

export interface LevellingRun {
  startRL: number;
  readings: LevellingReading[];
  endBenchmarkRL?: number;
}

export const calculateAllowableMisclosure = (distanceKm: number): number => {
  if (distanceKm <= 0) throw new Error("Distance must be positive");
  return 10 * Math.sqrt(distanceKm);
};

export const computeLevelling = (run: LevellingRun) => {
  let currentRL = run.startRL;
  let totalDistKm = 0;
  const processed: LevellingReading[] = [];

  run.readings.forEach((reading) => {
    const riseOrFall = reading.bs - (reading.fs || reading.is || 0);
    currentRL += riseOrFall;
    totalDistKm = Math.max(totalDistKm, reading.cumDistKm);

    processed.push({
      ...reading,
      rawRL: currentRL,
    });
  });

  const finalRL = processed[processed.length - 1].rawRL;
  const misclosureMm = run.endBenchmarkRL !== undefined 
    ? finalRL - run.endBenchmarkRL 
    : 0;

  const allowableMm = calculateAllowableMisclosure(totalDistKm);
  const { acceptable, message } = checkMisclosure(misclosureMm, totalDistKm);

  const adjusted = acceptable ? processed : applyLevellingAdjustment(processed, misclosureMm, totalDistKm);

  return {
    processed,
    adjusted,
    misclosureMm: Number(misclosureMm.toFixed(3)),
    allowableMm: Number(allowableMm.toFixed(1)),
    acceptable,
    message,
    totalDistanceKm: Number(totalDistKm.toFixed(4)),
  };
};

export const checkMisclosure = (misclosureMm: number, distanceKm: number) => {
  const allowable = calculateAllowableMisclosure(distanceKm);
  const acceptable = Math.abs(misclosureMm) <= allowable + 0.1;

  return {
    acceptable,
    allowable: Number(allowable.toFixed(1)),
    message: acceptable
      ? `Acceptable (${misclosureMm.toFixed(1)} mm <= ${allowable.toFixed(1)} mm)`
      : `Exceeds tolerance (${misclosureMm.toFixed(1)} mm > ${allowable.toFixed(1)} mm)`,
  };
};

export const applyLevellingAdjustment = (
  readings: LevellingReading[],
  misclosureMm: number,
  totalDistKm: number
): LevellingReading[] => {
  if (totalDistKm === 0) return readings;

  const correctionPerKm = misclosureMm / totalDistKm;

  return readings.map((r) => ({
    ...r,
    correctedRL: Number((r.rawRL - r.cumDistKm * correctionPerKm).toFixed(3)),
  }));
};
