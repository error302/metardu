import { createClient } from '@/lib/supabase/client'
import type { GeoFusionProject, FusionLayer, FusionAlignment } from '@/types/geofusion'

export async function createGeoFusionProject(params: {
  project_id: string
  name: string
  description?: string
  source_srid?: number
  target_srid?: number
  config?: any
}) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('geofusion_projects')
    .insert({
      project_id: params.project_id,
      user_id: user.id,
      name: params.name,
      description: params.description,
      source_srid: params.source_srid || 4326,
      target_srid: params.target_srid || 4326,
      config: params.config || {}
    })
    .select()
    .single()
  
  if (error) throw error
  return data as GeoFusionProject
}

export async function getGeoFusionProjects(projectId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('geofusion_projects')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data as GeoFusionProject[]
}

export async function getGeoFusionProject(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('geofusion_projects')
    .select('*')
    .eq('id', id)
    .single()
  
  if (error) throw error
  return data as GeoFusionProject
}

export async function updateGeoFusionProject(id: string, updates: Partial<GeoFusionProject>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('geofusion_projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return data as GeoFusionProject
}

export async function createFusionLayer(params: {
  geofusion_project_id: string
  layer_name: string
  layer_type: string
  source_data?: any
  geometry_type?: string
  properties?: any
  style_config?: any
}) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fusion_layers')
    .insert({
      geofusion_project_id: params.geofusion_project_id,
      layer_name: params.layer_name,
      layer_type: params.layer_type,
      source_data: params.source_data || {},
      geometry_type: params.geometry_type,
      properties: params.properties || {},
      style_config: params.style_config || {}
    })
    .select()
    .single()
  
  if (error) throw error
  return data as FusionLayer
}

export async function getFusionLayers(geofusionProjectId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fusion_layers')
    .select('*')
    .eq('geofusion_project_id', geofusionProjectId)
    .order('z_index', { ascending: true })
  
  if (error) throw error
  return data as FusionLayer[]
}

export async function updateFusionLayer(id: string, updates: Partial<FusionLayer>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fusion_layers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return data as FusionLayer
}

export async function deleteFusionLayer(id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('fusion_layers')
    .delete()
    .eq('id', id)
  
  if (error) throw error
}

export async function createFusionAlignment(params: {
  geofusion_project_id: string
  alignment_name: string
  source_layer_id?: string
  target_layer_id?: string
  transform_type: string
  transform_params?: any
}) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fusion_alignments')
    .insert({
      geofusion_project_id: params.geofusion_project_id,
      alignment_name: params.alignment_name,
      source_layer_id: params.source_layer_id,
      target_layer_id: params.target_layer_id,
      transform_type: params.transform_type,
      transform_params: params.transform_params || {}
    })
    .select()
    .single()
  
  if (error) throw error
  return data as FusionAlignment
}

export async function getFusionAlignments(geofusionProjectId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fusion_alignments')
    .select('*')
    .eq('geofusion_project_id', geofusionProjectId)
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data as FusionAlignment[]
}

export async function updateAlignmentStatus(id: string, status: string, accuracy_score?: number) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fusion_alignments')
    .update({ 
      status, 
      accuracy_score,
      updated_at: new Date().toISOString() 
    })
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return data as FusionAlignment
}
