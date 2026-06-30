export interface TracedPolygon {
  id: string;
  name: string;
  coordinates: Array<[number, number]>; // [lon, lat] in EPSG:4326
  areaSqm: number;
  areaAcres: number;
  areaHa: number;
  color: string;
  visible: boolean;
  createdAt: number;
}

export type TabId = 'upload' | 'trace' | 'export';
export type BasemapType = 'satellite' | 'osm';
