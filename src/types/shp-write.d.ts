declare module 'shp-write' {
  const shpWrite: {
    zip: (geojson: unknown, options?: Record<string, unknown>) => Promise<ArrayBuffer> | ArrayBuffer | Buffer
  }

  export = shpWrite
}
