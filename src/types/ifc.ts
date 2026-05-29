/**
 * IFC4 Export Types for METARDU
 *
 * Defines input interfaces for the IFC4 STEP file generator.
 * Converts survey/cadastral data (UTM coordinates in metres)
 * into the IFC4 data model (coordinates in millimetres).
 */

// ── Vertex / coordinate pair used by parcels ──────────────────────────────
export interface IFCVertex {
  easting: number;
  northing: number;
  elevation?: number;
}

// ── Cadastral parcel (closed polygon) ─────────────────────────────────────
export interface IFCParcel {
  id: string;
  label: string; // e.g. "Plot 123"
  vertices: IFCVertex[];
  areaM2?: number;
  parcelNumber?: string;
}

// ── Survey control point / beacon ─────────────────────────────────────────
export interface IFCControlPoint {
  id: string;
  label: string; // e.g. "BP1"
  easting: number;
  northing: number;
  elevation?: number;
  beaconType?: string;
  description?: string;
}

// ── Traverse line connecting two control points ───────────────────────────
export interface IFCTraverseLine {
  fromPoint: string; // control point label
  toPoint: string;
  distance?: number;
}

// ── Equipment metadata record ─────────────────────────────────────────────
export interface IFCEquipmentRecord {
  id: string;
  make: string;
  model: string;
  serialNumber?: string;
  lastCalibration?: string;
}

// ── Top-level export options ──────────────────────────────────────────────
export interface IFCExportOptions {
  projectName: string;
  projectNumber?: string;
  surveyorName?: string;
  surveyorLicense?: string;
  coordinateSystem: string; // e.g. 'UTM_37S'
  epsgCode?: number; // e.g. 32737
  originEasting?: number; // false origin for IFC coordinate offsets
  originNorthing?: number;
  parcels?: IFCParcel[];
  controlPoints?: IFCControlPoint[];
  traverseLines?: IFCTraverseLine[];
  equipment?: IFCEquipmentRecord[];
}
