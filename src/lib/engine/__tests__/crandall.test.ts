import { crandallAdjustment, TraverseInput } from '../traverse';
import { NamedPoint2D } from '../types';

describe('crandallAdjustment', () => {
  it('correctly adjusts distances using Crandall method', () => {
    // Example from surveying textbook principles
    const startPt: NamedPoint2D = { name: 'P1', easting: 1000.0, northing: 5000.0 };
    const input: TraverseInput = {
      points: [startPt],
      distances: [100.0, 150.0, 100.0, 149.9],
      // Square, but short by 0.1m on the last leg
      bearings: [90.0, 180.0, 270.0, 0.0],
    };

    const result = crandallAdjustment(input);
    
    // Total distance = 499.9
    expect(result.totalDistance).toBe(499.9);
    expect(result.legs.length).toBe(4);
    
    // Check misclosure:
    // Raw sumDep = 100 + 0 - 100 + 0 = 0
    // Raw sumLat = 0 - 150 + 0 + 149.9 = -0.1
    expect(result.closingErrorE).toBeCloseTo(0, 3);
    expect(result.closingErrorN).toBeCloseTo(0.1, 3); // target(0) - computed(-0.1)
    
    // Adjusted points - should close back to start
    const lastLeg = result.legs[result.legs.length - 1];
    expect(lastLeg.adjEasting).toBeCloseTo(1000.0, 3);
    expect(lastLeg.adjNorthing).toBeCloseTo(5000.0, 3);
  });

  it('handles zero misclosure correctly', () => {
    const input: TraverseInput = {
      points: [{ name: 'A', easting: 500.0, northing: 500.0 }],
      distances: [100.0, 100.0, 100.0, 100.0],
      bearings: [0.0, 90.0, 180.0, 270.0],
    };
    const result = crandallAdjustment(input);
    
    expect(result.closingErrorE).toBeCloseTo(0, 5);
    expect(result.closingErrorN).toBeCloseTo(0, 5);
    
    for (const leg of result.legs) {
      expect(leg.correctionE).toBeCloseTo(0, 5);
      expect(leg.correctionN).toBeCloseTo(0, 5);
    }
  });

  it('computes precision ratio and grade properly', () => {
    const input: TraverseInput = {
      points: [{ name: 'START', easting: 0, northing: 0 }],
      distances: [1000.0, 1000.0, 1000.0, 999.0], // 1m misclosure on 3999m
      bearings: [0.0, 90.0, 180.0, 270.0],
    };
    const result = crandallAdjustment(input);
    
    expect(result.linearError).toBeCloseTo(1.0, 3);
    expect(Math.round(result.precisionRatio)).toBe(3999);
    // Grade 3000-5000 -> acceptable
    expect(result.precisionGrade).toBe('acceptable');
  });
});
