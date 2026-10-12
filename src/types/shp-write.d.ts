declare module 'shp-write' {
  const shpWrite: {
    write: (rows: Record<string, unknown>[], geometryType: 'POLYGON' | 'POLYLINE' | 'POINT', geometries: unknown[], callback: (error: Error | null, result: {shp: DataView; shx: DataView; dbf: DataView}) => void) => void
    zip: (geojson: unknown, options?: Record<string, unknown>) => Promise<ArrayBuffer> | ArrayBuffer | Buffer
  }

  export = shpWrite
}
