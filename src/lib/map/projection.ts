'use client';

export const EPSG_21037_DEF =
  '+proj=utm +zone=37 +south +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs';

export const SRID_21037 = 'EPSG:21037';
export const SRID_3857  = 'EPSG:3857';
export const SRID_4326  = 'EPSG:4326';

let registered = false;

export async function registerProjections(): Promise<void> {
  if (registered || typeof window === 'undefined') return;

  const [proj4Module, { register }] = await Promise.all([
    import('proj4'),
    import('ol/proj/proj4'),
  ]);

  const proj4 = proj4Module.default;
  proj4.defs(SRID_21037, EPSG_21037_DEF);
  register(proj4);

  registered = true;
}

export async function to3857(easting: number, northing: number): Promise<[number, number]> {
  const { transform } = await import('ol/proj');
  return transform([easting, northing], SRID_21037, SRID_3857) as [number, number];
}

export async function arrayTo3857(
  coords: Array<[number, number]>
): Promise<Array<[number, number]>> {
  const { transform } = await import('ol/proj');
  return coords.map(([e, n]) => transform([e, n], SRID_21037, SRID_3857) as [number, number]);
}

export async function to21037(x: number, y: number): Promise<[number, number]> {
  const { transform } = await import('ol/proj');
  return transform([x, y], SRID_3857, SRID_21037) as [number, number];
}