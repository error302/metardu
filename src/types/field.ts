export type CoordinateSystem = 'WGS84' | 'UTM_36S' | 'UTM_37S' | 'EPSG_21036' | 'EPSG_21037';

export interface FieldCoordinate {
  lat: number;
  lng: number;
  altitude?: number;
  accuracy?: number;
  timestamp: number;
}

export interface FieldBeacon {
  id: string;
  label: string;                      // e.g. "BP1", "IP3"
  coordinate: FieldCoordinate;
  beaconType: 'beacon_post' | 'iron_pin' | 'reference_object' | 'gps_point';
  notes?: string;
  photos?: string[];                  // base64 or local file URIs
  capturedAt: number;
}

export interface FieldWalkPoint {
  coordinate: FieldCoordinate;
  sequence: number;
}

export interface FieldParcel {
  id: string;
  label: string;                      // e.g. "Plot 123"
  walkPoints: FieldWalkPoint[];
  computedAreaM2?: number;
  computedPerimeterM?: number;
  closedAt?: number;
}

export interface MapLayer {
  id: string;
  name: string;
  type: 'mbtiles' | 'kml' | 'kmz' | 'geojson';
  geojson?: GeoJSON.FeatureCollection;
  mbtilesPath?: string;               // local filesystem path
  visible: boolean;
  loadedAt: number;
}

export interface FieldProject {
  id: string;
  name: string;
  countyCode: string;                 // e.g. "030" for Nairobi
  parcelNumber?: string;
  surveyorId: string;                 // Supabase user ID
  beacons: FieldBeacon[];
  parcels: FieldParcel[];
  layers: MapLayer[];
  coordinateSystem: CoordinateSystem;
  createdAt: number;
  updatedAt: number;
  syncedToSupabase: boolean;
}

export interface WalkSession {
  active: boolean;
  intervalMs: number;                 // default 5000 (one point per 5 metres at walking pace)
  minDistanceM: number;              // default 3.0 — ignore jitter below this
  points: FieldWalkPoint[];
  watchId?: string;
}

export interface FieldExportOptions {
  format: 'kml' | 'csv' | 'geojson';
  includeBeacons: boolean;
  includeParcels: boolean;
  includeLayers: boolean;
}

// GeoPDF ground control point — maps pixel (x,y) to WGS84 (lat,lng)
export interface GCP {
  id: string;
  pixelX: number;
  pixelY: number;
  lat: number;
  lng: number;
  label: string; // 'TL' | 'TR' | 'BL' | 'BR'
}

export interface GeoPDFLayer {
  id: string;
  name: string;
  dataUrl: string;       // base64 PNG of rendered PDF page
  widthPx: number;
  heightPx: number;
  gcps: GCP[];           // exactly 4 required before the layer activates on map
  visible: boolean;
  loadedAt: number;
}

export interface MBTilesSession {
  key: string;           // UUID returned by /api/field/mbtiles/upload
  name: string;
  minZoom: number;
  maxZoom: number;
  bounds?: [number, number, number, number]; // [west, south, east, north] WGS84
}

// For Push to Traverse — maps to what traverseEngine.ts expects
export interface TraverseStationInput {
  id: string;
  label: string;         // e.g. 'BP1'
  easting: number;       // UTM or projected — derived from WGS84 via proj4
  northing: number;
  elevation?: number;
  coordinateSystem: string; // e.g. 'UTM_37S'
}
