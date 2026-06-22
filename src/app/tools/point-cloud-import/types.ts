export interface ImportedPoint {
  id: string;
  name: string;
  easting: number;
  northing: number;
  elevation: number;
}

export interface ParseError {
  row: number;
  message: string;
}

export interface ColumnMapping {
  id: number;    // column index
  easting: number;
  northing: number;
  elevation: number;
  name: number;
}

export type TabId = 'import' | 'statistics' | 'slope' | 'tin';
export type SortColumn = 'name' | 'easting' | 'northing' | 'elevation';
export type SortDir = 'asc' | 'desc';

export interface ImportStats {
  totalLines: number;
  delimiter: string;
  hasHeader: boolean;
  pointCount: number;
}

export interface BoundingBox {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
  minZ: number;
  maxZ: number;
}
