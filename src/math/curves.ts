// src/math/curves.ts
// Compliant with Schofield Ch.10 + Basak Ch.10 (Rankine's Deflection Angle Method)

export type CircularCurveData = {
  radius: number;
  deflectionAngle: number;
  chainageStart: number;
};

export const computeCircularCurve = (data: CircularCurveData) => {
  const { radius, deflectionAngle, chainageStart } = data;
  
  const deflectionRad = (deflectionAngle * Math.PI) / 180;
  const tangentLength = radius * Math.tan(deflectionRad / 2);
  const curveLength = radius * deflectionRad;
  const longChord = 2 * radius * Math.sin(deflectionRad / 2);

  const interval = 20;
  const numIntervals = Math.ceil(curveLength / interval);
  
  const deflections: Array<{ chainage: number; deflectionAngleDeg: number }> = [];
  
  for (let i = 1; i <= numIntervals; i++) {
    const chordDist = Math.min(i * interval, curveLength);
    const deflectionDeg = (1718.873 * chordDist) / radius;
    deflections.push({
      chainage: Number((chainageStart + chordDist).toFixed(2)),
      deflectionAngleDeg: Number((deflectionDeg / 60).toFixed(4))
    });
  }

  return {
    tangentLength: Number(tangentLength.toFixed(3)),
    curveLength: Number(curveLength.toFixed(3)),
    longChord: Number(longChord.toFixed(3)),
    apexDistance: Number((radius * (1 - Math.cos(deflectionRad / 2))).toFixed(3)),
    deflections,
    message: `Curve computed using Rankine's deflection angle method`
  };
};
