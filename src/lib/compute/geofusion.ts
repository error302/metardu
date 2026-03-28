'use client'

const BASE = process.env.NEXT_PUBLIC_URL || ''

export interface GeoFusionProjectSummary {
  id: string
  name: string
  status: string
  layer_count: number
  created_at: string
}

export interface LayerSummary {
  id: string
  layer_name: string
  layer_type: string
  geometry_type?: string
  visibility: boolean
  opacity: number
}

export interface AlignmentResult {
  alignment_id: string
  status: string
  accuracy_score: number
  transformed_data: any
}

export async function createGeoFusionProject(params: {
  project_id: string
  name: string
  description?: string
  source_srid?: number
  target_srid?: number
}) {
  const res = await fetch(`${BASE}/api/geofusion/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to create GeoFusion project')
  }

  return res.json() as Promise<GeoFusionProjectSummary>
}

export async function getGeoFusionProjects(projectId: string) {
  const res = await fetch(`${BASE}/api/geofusion/projects?project_id=${projectId}`)

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to fetch GeoFusion projects')
  }

  return res.json() as Promise<GeoFusionProjectSummary[]>
}

export async function alignLayers(params: {
  project_id: string
  source_layer_id: string
  target_layer_id?: string
  transform_type: string
  control_points?: Array<{
    source: { x: number; y: number }
    target: { x: number; y: number }
    weight?: number
  }>
}) {
  const res = await fetch(`${BASE}/api/geofusion/align`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to align layers')
  }

  return res.json() as Promise<AlignmentResult>
}

export async function integrateLayers(params: {
  project_id: string
  layer_ids: string[]
  merge_strategy: 'overlay' | 'union' | 'intersection'
}) {
  const res = await fetch(`${BASE}/api/geofusion/integrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to integrate layers')
  }

  return res.json() as Promise<{ integrated_data: any; layer_count: number; features_created: number }>
}

export async function uploadLayer(params: {
  geofusion_project_id: string
  layer_name: string
  layer_type: string
  file?: File
  geojson_data?: any
}) {
  const formData = new FormData()
  formData.append('geofusion_project_id', params.geofusion_project_id)
  formData.append('layer_name', params.layer_name)
  formData.append('layer_type', params.layer_type)
  
  if (params.file) {
    formData.append('file', params.file)
  } else if (params.geojson_data) {
    formData.append('geojson_data', JSON.stringify(params.geojson_data))
  }

  const res = await fetch(`${BASE}/api/geofusion/layers`, {
    method: 'POST',
    body: formData
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to upload layer')
  }

  return res.json() as Promise<LayerSummary>
}

export async function updateLayerStyle(layerId: string, style: {
  visibility?: boolean
  opacity?: number
  color?: string
}) {
  const res = await fetch(`${BASE}/api/geofusion/layers/${layerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(style)
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to update layer style')
  }

  return res.json() as Promise<LayerSummary>
}

export async function getCrossAnalysis(params: {
  project_id: string
  layer_ids: string[]
  analysis_type: 'overlay' | 'buffer' | 'distance'
}) {
  const res = await fetch(`${BASE}/api/geofusion/cross-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to run cross analysis')
  }

  return res.json() as Promise<{ results: any; summary: any }>
}
