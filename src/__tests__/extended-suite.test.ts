/**
 * Extended Test Suite — Curves, Volumes, and Integration
 */

import { describe, it, expect } from 'vitest';

// ─── Circular Curves ─────────────────────────────────────────────
import {
  computeCircularCurve,
  computeCurveFromTangent,
  computeCurveFromDegree,
  computeCurveStations,
} from '../lib/survey/curves/circular';

// ─── Vertical Curves ─────────────────────────────────────────────
import {
  computeVerticalCurve,
  computeVerticalCurveStations,
} from '../lib/survey/curves/vertical';

// ─── Spiral/Transition Curves ─────────────────────────────────────
import {
  computeSpiralCurve,
} from '../lib/survey/curves/transition';

// ─── Volumes ──────────────────────────────────────────────────────
import {
  computeEndAreaVolume,
  computeTotalVolumes,
  computePrismoidalVolume,
} from '../lib/survey/volumes/end-area';

// ─── LRU Cache ────────────────────────────────────────────────────
import { LRUCache } from '../lib/cache/memory-cache';

// ═════════════════════════════════════════════════════════════════
// CIRCULAR CURVE TESTS
// ═════════════════════════════════════════════════════════════════

describe('Circular Curve', () => {
  it('should compute correct curve elements for 30° intersection, R=200m', () => {
    const result = computeCircularCurve({
      intersectionAngle: 30,
      radius: 200,
    });
    
    // T = R × tan(Δ/2) = 200 × tan(15°) = 200 × 0.2679 = 53.59m
    expect(result.tangentLength).toBeCloseTo(53.59, 1);
    
    // L = R × Δ(rad) = 200 × 30° × π/180 = 200 × 0.5236 = 104.72m
    expect(result.curveLength).toBeCloseTo(104.72, 1);
    
    // LC = 2R × sin(Δ/2) = 2 × 200 × sin(15°) = 103.53m
    expect(result.longChordLength).toBeCloseTo(103.53, 1);
    
    // E = R × (sec(Δ/2) - 1) = 200 × (sec(15°) - 1) = 7.08m
    expect(result.externalDistance).toBeCloseTo(7.08, 1);
  });

  it('should compute correct curve for 90° intersection, R=100m', () => {
    const result = computeCircularCurve({
      intersectionAngle: 90,
      radius: 100,
    });
    
    // T = 100 × tan(45°) = 100m
    expect(result.tangentLength).toBeCloseTo(100, 1);
    
    // L = 100 × π/2 = 157.08m
    expect(result.curveLength).toBeCloseTo(157.08, 1);
  });

  it('should compute degree of curvature', () => {
    const result = computeCircularCurve({
      intersectionAngle: 30,
      radius: 5729.578, // D = 1°
    });
    
    expect(result.degreeOfCurvature).toBeCloseTo(1, 2);
  });

  it('should compute curve from tangent length', () => {
    // If T = 53.59m for Δ=30°, then R should be 200m
    const result = computeCurveFromTangent(53.59, 30);
    expect(result.radius).toBeCloseTo(200, 0);
  });

  it('should compute curve from degree of curvature', () => {
    const result = computeCurveFromDegree(2, 30);
    // R = 5729.578 / 2 = 2864.789m
    expect(result.radius).toBeCloseTo(2864.789, 1);
  });

  it('should generate setting-out stations', () => {
    const curve = computeCircularCurve({
      intersectionAngle: 30,
      radius: 200,
    });
    
    const stations = computeCurveStations(curve, 20, 1000);
    
    // Should have PC (chainage 1000) and PT
    expect(stations[0].chainage).toBe(1000);
    expect(stations[0].deflectionAngle).toBe(0);
    expect(stations.length).toBeGreaterThan(2);
    
    // Last station should be PT
    const lastStation = stations[stations.length - 1];
    expect(lastStation.deflectionAngle).toBeCloseTo(15, 1); // Half of 30°
  });
});

// ═════════════════════════════════════════════════════════════════
// VERTICAL CURVE TESTS
// ═════════════════════════════════════════════════════════════════

describe('Vertical Curve', () => {
  it('should compute correct curve for crest (g1=+3%, g2=-2%)', () => {
    const result = computeVerticalCurve({
      g1: 3,
      g2: -2,
      length: 200,
      pvcElevation: 100,
      pvcChainage: 1000,
    });
    
    expect(result.A).toBeCloseTo(-5, 2);
    expect(result.curveType).toBe('crest');
    expect(result.K).toBeCloseTo(40, 0); // K = L / |A| = 200 / 5
    expect(result.pvtElevation).toBeCloseTo(106, 1); // 100 + 3% × 200m
    expect(result.pvtChainage).toBe(1200);
  });

  it('should compute correct curve for sag (g1=-2%, g2=+4%)', () => {
    const result = computeVerticalCurve({
      g1: -2,
      g2: 4,
      length: 150,
      pvcElevation: 50,
      pvcChainage: 500,
    });
    
    expect(result.A).toBeCloseTo(6, 2);
    expect(result.curveType).toBe('sag');
  });

  it('should compute turning point within curve', () => {
    const result = computeVerticalCurve({
      g1: 3,
      g2: -2,
      length: 200,
      pvcElevation: 100,
      pvcChainage: 1000,
    });
    
    // Turning point at x = -g1 × L / A = -3 × 200 / -5 = 120m from PVC
    expect(result.turningPointDistance).toBeCloseTo(120, 0);
    expect(result.turningPointChainage).toBeCloseTo(1120, 0);
    expect(result.turningPointElevation).toBeGreaterThan(100);
  });

  it('should generate stations along the curve', () => {
    const curve = computeVerticalCurve({
      g1: 2,
      g2: -3,
      length: 100,
      pvcElevation: 50,
      pvcChainage: 1000,
    });
    
    const stations = computeVerticalCurveStations(curve, 20);
    
    expect(stations.length).toBeGreaterThan(4);
    expect(stations[0].chainage).toBe(1000);
    expect(stations[0].elevation).toBeCloseTo(50, 2);
  });
});

// ═════════════════════════════════════════════════════════════════
// SPIRAL/TRANSITION CURVE TESTS
// ═════════════════════════════════════════════════════════════════

describe('Spiral Curve', () => {
  it('should compute spiral parameters for 80km/h, R=300m', () => {
    const result = computeSpiralCurve({
      radius: 300,
      designSpeed: 80,
    });
    
    expect(result.spiralLength).toBeGreaterThan(0);
    expect(result.spiralAngle).toBeGreaterThan(0);
    expect(result.p).toBeGreaterThan(0); // Tangent shift
    expect(result.k).toBeGreaterThan(0); // Tangent extension
    expect(result.x).toBeGreaterThan(0);
    expect(result.y).toBeGreaterThan(0);
    expect(result.longChord).toBeGreaterThan(0);
  });

  it('should compute longer spiral for higher speed', () => {
    const slow = computeSpiralCurve({ radius: 300, designSpeed: 60 });
    const fast = computeSpiralCurve({ radius: 300, designSpeed: 100 });
    
    expect(fast.spiralLength).toBeGreaterThan(slow.spiralLength);
  });

  it('should compute shorter spiral for larger radius', () => {
    const tight = computeSpiralCurve({ radius: 200, designSpeed: 80 });
    const wide = computeSpiralCurve({ radius: 500, designSpeed: 80 });
    
    expect(wide.spiralLength).toBeLessThan(tight.spiralLength);
  });
});

// ═════════════════════════════════════════════════════════════════
// VOLUME COMPUTATION TESTS
// ═════════════════════════════════════════════════════════════════

describe('Volume Computation', () => {
  it('should compute end-area volume between two sections', () => {
    const result = computeEndAreaVolume(
      { chainage: 0, cutArea: 100, fillArea: 0 },
      { chainage: 20, cutArea: 120, fillArea: 0 }
    );
    
    // V = (100 + 120) / 2 × 20 = 2200 m³
    expect(result.cutVolume).toBeCloseTo(2200, 1);
    expect(result.fillVolume).toBeCloseTo(0, 1);
    expect(result.netVolume).toBeCloseTo(2200, 1);
    expect(result.method).toBe('end_area');
  });

  it('should compute fill volume', () => {
    const result = computeEndAreaVolume(
      { chainage: 0, cutArea: 0, fillArea: 50 },
      { chainage: 30, cutArea: 0, fillArea: 70 }
    );
    
    // V = (50 + 70) / 2 × 30 = 1800 m³
    expect(result.fillVolume).toBeCloseTo(1800, 1);
    expect(result.netVolume).toBeCloseTo(-1800, 1);
  });

  it('should compute total volumes from multiple sections', () => {
    const sections = [
      { chainage: 0, cutArea: 100, fillArea: 0 },
      { chainage: 20, cutArea: 120, fillArea: 0 },
      { chainage: 40, cutArea: 80, fillArea: 10 },
      { chainage: 60, cutArea: 50, fillArea: 30 },
    ];
    
    const result = computeTotalVolumes(sections);
    
    expect(result.sectionCount).toBe(4);
    expect(result.totalCut).toBeGreaterThan(0);
    expect(result.totalFill).toBeGreaterThan(0);
    expect(result.sections.length).toBe(3); // 3 intervals between 4 sections
    expect(result.chainageRange.from).toBe(0);
    expect(result.chainageRange.to).toBe(60);
  });

  it('should compute prismoidal volume', () => {
    const result = computePrismoidalVolume(
      { chainage: 0, cutArea: 100, fillArea: 0 },
      { chainage: 20, cutArea: 110, fillArea: 0 },  // Mid-section
      { chainage: 40, cutArea: 80, fillArea: 0 }
    );
    
    // V = L/6 × (A1 + 4×Am + A2) = 40/6 × (100 + 440 + 80) = 40/6 × 620 = 4133.33
    expect(result.cutVolume).toBeCloseTo(4133.33, 0);
    expect(result.method).toBe('prismoidal');
  });

  it('should throw for fewer than 2 sections', () => {
    expect(() => computeTotalVolumes([{ chainage: 0, cutArea: 100, fillArea: 0 }])).toThrow();
  });

  it('should sort sections by chainage', () => {
    const sections = [
      { chainage: 40, cutArea: 80, fillArea: 0 },
      { chainage: 0, cutArea: 100, fillArea: 0 },
      { chainage: 20, cutArea: 120, fillArea: 0 },
    ];
    
    const result = computeTotalVolumes(sections);
    expect(result.chainageRange.from).toBe(0);
    expect(result.chainageRange.to).toBe(40);
  });
});

// ═════════════════════════════════════════════════════════════════
// LRU CACHE TESTS
// ═════════════════════════════════════════════════════════════════

describe('LRU Cache', () => {
  it('should store and retrieve values', () => {
    const cache = new LRUCache<string>({ maxSize: 10, defaultTTL: 60000 });
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    const cache = new LRUCache({ maxSize: 10 });
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should evict oldest entry when full', () => {
    const cache = new LRUCache<number>({ maxSize: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4); // Should evict 'a'
    
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('d')).toBe(4);
    expect(cache.getStats().size).toBe(3);
  });

  it('should expire entries after TTL', async () => {
    const cache = new LRUCache<string>({ maxSize: 10, defaultTTL: 50 }); // 50ms TTL
    cache.set('short', 'value');
    
    expect(cache.get('short')).toBe('value');
    
    // Wait for expiry
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(cache.get('short')).toBeUndefined();
  });

  it('should track hit rate', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    cache.set('key', 'value');
    
    cache.get('key');    // Hit
    cache.get('key');    // Hit
    cache.get('miss');   // Miss
    
    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2/3, 2);
  });

  it('should support getOrCompute', async () => {
    const cache = new LRUCache<number>({ maxSize: 10 });
    let computeCount = 0;
    
    const result1 = await cache.getOrCompute('key', async () => {
      computeCount++;
      return 42;
    });
    
    const result2 = await cache.getOrCompute('key', async () => {
      computeCount++;
      return 99;
    });
    
    expect(result1).toBe(42);
    expect(result2).toBe(42); // Cached value
    expect(computeCount).toBe(1); // Only computed once
  });

  it('should invalidate entries by pattern', () => {
    const cache = new LRUCache<number>({ maxSize: 10 });
    cache.set('project:1', 1);
    cache.set('project:2', 2);
    cache.set('survey:1', 3);
    
    const count = cache.invalidatePattern('project:');
    expect(count).toBe(2);
    expect(cache.get('project:1')).toBeUndefined();
    expect(cache.get('survey:1')).toBe(3);
  });

  it('should clear all entries', () => {
    const cache = new LRUCache<number>({ maxSize: 10 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    
    expect(cache.getStats().size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });
});
