export interface TerrainXY { x: number; y: number }
export interface TerrainRegion { outer: TerrainXY[]; holes: TerrainXY[][] }
export interface TerrainDomain { regions: TerrainRegion[] }
