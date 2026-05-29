export type BasemapMode = 'osm' | 'satellite' | 'dark' | 'terrain'
export type DrawMode = 'none' | 'Point' | 'LineString' | 'Polygon' | 'Circle'
export type MeasureMode = 'none' | 'distance' | 'area'

export interface PopupData {
  coordinate: number[]
  projectName?: string
  stationName?: string
  easting?: string
  northing?: string
  geometryType?: string
}
