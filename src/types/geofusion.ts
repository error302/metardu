export interface GeoFusionProject {
  id: string
  project_id: string
  user_id: string
  name: string
  description?: string
  source_srid: number
  target_srid: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  config: GeoFusionConfig
  created_at: string
  updated_at: string
}

export interface GeoFusionConfig {
  align_method?: 'affine' | 'similarity' | 'projective' | 'helmert'
  interpolation?: 'nearest' | 'bilinear' | 'bicubic'
  merge_strategy?: 'overlay' | 'union' | 'intersection'
  tolerance?: number
}

export interface FusionLayer {
  id: string
  geofusion_project_id: string
  layer_name: string
  layer_type: 'raster' | 'vector' | 'point_cloud' | 'mesh'
  source_data: LayerSourceData
  geometry_type?: 'point' | 'line' | 'polygon' | 'multi'
  properties: Record<string, any>
  style_config: LayerStyle
  visibility: boolean
  opacity: number
  z_index: number
  created_at: string
  updated_at: string
}

export interface LayerSourceData {
  type: 'geojson' | 'wms' | 'wfs' | 'xyz' | 'file'
  url?: string
  data?: any
  file_path?: string
}

export interface LayerStyle {
  color?: string
  fill_color?: string
  stroke_color?: string
  stroke_width?: number
  point_size?: number
  opacity?: number
}

export interface FusionAlignment {
  id: string
  geofusion_project_id: string
  alignment_name: string
  source_layer_id?: string
  target_layer_id?: string
  transform_type: 'affine' | 'similarity' | 'projective' | 'helmert' | 'custom'
  transform_params?: Record<string, number>
  accuracy_score?: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
  updated_at: string
}

export interface AlignDataRequest {
  project_id: string
  source_layer_id: string
  target_layer_id?: string
  transform_type: string
  control_points?: ControlPoint[]
  params?: Record<string, number>
}

export interface ControlPoint {
  source: { x: number; y: number }
  target: { x: number; y: number }
  weight?: number
}

export interface AlignDataResponse {
  alignment_id: string
  status: string
  accuracy_score: number
  transformed_data: any
  errors: string[]
}

export interface IntegrateLayersRequest {
  project_id: string
  layer_ids: string[]
  merge_strategy: 'overlay' | 'union' | 'intersection'
  output_format: 'geojson' | 'gml' | 'shapefile'
}

export interface IntegrateLayersResponse {
  integrated_data: any
  layer_count: number
  features_created: number
  errors: string[]
}

export interface GeoFusionStats {
  total_projects: number
  active_projects: number
  total_layers: number
  total_alignments: number
}
