declare module 'cdt2d' {
  export default function triangulate(points: number[][], edges?: number[][], options?: {
    delaunay?: boolean; interior?: boolean; exterior?: boolean; infinity?: boolean;
  }): number[][]
}

declare module 'robust-orientation' {
  const orientation: { 3: (a: number[], b: number[], c: number[]) => number }
  export default orientation
}
