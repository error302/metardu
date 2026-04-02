// src/math/area.ts
// Shoelace formula - Standard, most accurate method taught in both books

export type CoordinatePoint = {
  e: number;
  n: number;
};

export const computePolygonArea = (points: CoordinatePoint[]): number => {
  if (points.length < 3) throw new Error("Minimum 3 points required for polygon");

  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += (points[i].e * points[j].n) - (points[j].e * points[i].n);
  }

  return Math.abs(area) / 2;
};

export const computePerimeter = (points: CoordinatePoint[]): number => {
  let perimeter = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = points[j].e - points[i].e;
    const dy = points[j].n - points[i].n;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
};
