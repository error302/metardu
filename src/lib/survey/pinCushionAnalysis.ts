/**
 * Pin Cushion / Monument Recovery Analysis Engine
 * 
 * Source: Ghilani & Wolf, Elementary Surveying 16th Ed., Chapter 3 (Statistics)
 * Source: Mikhail & Ackermann, Observations and Least Squares (Error Ellipses)
 */

export interface MonumentRecovery {
  id: string;
  easting: number;
  northing: number;
  elevation?: number;
  date: string;
  surveyor?: string;
  instrument?: string;
  method?: 'GNSS RTK' | 'Total Station' | 'GNSS Static' | 'Tape & Compass' | string;
  weight?: number;
}

export interface PinCushionInput {
  monumentId: string;
  monumentType: 'concrete' | 'iron_pin' | 'peg' | 'natural' | 'pillar' | string;
  recoveries: MonumentRecovery[];
  useWeightedMean?: boolean;
}

export interface PinCushionResult {
  monumentId: string;
  meanPosition: { easting: number; northing: number; elevation?: number };
  weightedMeanPosition: { easting: number; northing: number };
  standardDeviation: { easting: number; northing: number };
  confidenceEllipse: {
    semiMajor: number;
    semiMinor: number;
    rotation: number;
  };
  maxSpread: number;
  outliers: MonumentRecovery[];
  cleanedMean: { easting: number; northing: number };
  recoveryCount: number;
  qualityGrade: 'excellent' | 'good' | 'acceptable' | 'poor';
}

export function analyzePinCushion(input: PinCushionInput): PinCushionResult {
  const n = input.recoveries.length;
  if (n === 0) {
    throw new Error('No recoveries provided');
  }

  // Assign default weights if none provided
  const data = input.recoveries.map(r => ({ ...r, weight: r.weight ?? 1.0 }));

  let sumE = 0, sumN = 0, sumElev = 0, elevCount = 0;
  let sumWE = 0, sumWN = 0, sumW = 0;

  for (const r of data) {
    sumE += r.easting;
    sumN += r.northing;
    if (r.elevation !== undefined) {
      sumElev += r.elevation;
      elevCount++;
    }
    
    sumWE += r.easting * r.weight;
    sumWN += r.northing * r.weight;
    sumW += r.weight;
  }

  const meanE = sumE / n;
  const meanN = sumN / n;
  const meanElev = elevCount > 0 ? sumElev / elevCount : undefined;

  const wMeanE = sumWE / sumW;
  const wMeanN = sumWN / sumW;

  let varE = 0, varN = 0, covEN = 0;
  if (n > 1) {
    for (const r of data) {
      varE += Math.pow(r.easting - meanE, 2);
      varN += Math.pow(r.northing - meanN, 2);
      covEN += (r.easting - meanE) * (r.northing - meanN);
    }
    varE /= (n - 1);
    varN /= (n - 1);
    covEN /= (n - 1);
  }

  const stdE = Math.sqrt(varE);
  const stdN = Math.sqrt(varN);

  // Confidence Ellipse (95%)
  // Eigenvalues of covariance matrix
  const trace = varE + varN;
  const det = varE * varN - covEN * covEN;
  const desc = Math.sqrt(Math.max(0, trace * trace - 4 * det));
  
  const lambda1 = (trace + desc) / 2;
  const lambda2 = (trace - desc) / 2;

  // 95% confidence chi-square statistic for 2 DOF is ~5.991, sqrt is ~2.447
  const k95 = 2.447;
  const semiMajor = Math.sqrt(Math.max(0, lambda1)) * k95;
  const semiMinor = Math.sqrt(Math.max(0, lambda2)) * k95;

  // Rotation: azimuth of semi-major axis
  let rotation = 0;
  if (covEN !== 0 || varN !== varE) {
    // In surveying, North is Y, East is X. We want azimuth from North.
    // tan(2*theta) = 2*covEN / (varN - varE)
    rotation = 0.5 * Math.atan2(2 * covEN, varN - varE) * (180 / Math.PI);
    if (rotation < 0) rotation += 180;
  }

  // Max spread
  let maxSpread = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = Math.sqrt(
        Math.pow(data[i].easting - data[j].easting, 2) + 
        Math.pow(data[i].northing - data[j].northing, 2)
      );
      if (dist > maxSpread) maxSpread = dist;
    }
  }

  // Outlier detection: > 2 std dev in distance from mean
  const combinedStd = Math.sqrt(varE + varN) || 0.001; // Avoid zero division
  const outliers: MonumentRecovery[] = [];
  let cleanedWE = 0, cleanedWN = 0, cleanedW = 0;

  for (const r of data) {
    const distFromMean = Math.sqrt(Math.pow(r.easting - meanE, 2) + Math.pow(r.northing - meanN, 2));
    if (distFromMean > 2 * combinedStd && n > 2) {
      outliers.push(r);
    } else {
      cleanedWE += r.easting * r.weight;
      cleanedWN += r.northing * r.weight;
      cleanedW += r.weight;
    }
  }

  const cleanedMean = cleanedW > 0 
    ? { easting: cleanedWE / cleanedW, northing: cleanedWN / cleanedW }
    : { easting: wMeanE, northing: wMeanN };

  // Quality Grade
  const maxStd = Math.max(stdE, stdN);
  let qualityGrade: 'excellent' | 'good' | 'acceptable' | 'poor' = 'poor';
  if (maxStd < 0.005) qualityGrade = 'excellent';
  else if (maxStd < 0.015) qualityGrade = 'good';
  else if (maxStd < 0.050) qualityGrade = 'acceptable';

  return {
    monumentId: input.monumentId,
    meanPosition: { easting: meanE, northing: meanN, elevation: meanElev },
    weightedMeanPosition: { easting: wMeanE, northing: wMeanN },
    standardDeviation: { easting: stdE, northing: stdN },
    confidenceEllipse: { semiMajor, semiMinor, rotation },
    maxSpread,
    outliers,
    cleanedMean,
    recoveryCount: n,
    qualityGrade
  };
}
