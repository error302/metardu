// src/lib/supabase/mineTwins.ts

import { createClient } from '@/lib/supabase/server'
import type { MineTwin, MeshData, VolumeCalculation, ConvergencePoint, SurveyPoint3D } from '@/types/minetwin'

export async function createMineTwin(params: {
  project_id: string
  user_id: string
  mesh_data: MeshData
  volumes?: VolumeCalculation
  convergence?: ConvergencePoint[]
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('mine_twins')
    .insert({
      project_id: params.project_id,
      user_id: params.user_id,
      mesh_data: params.mesh_data,
      volumes: params.volumes,
      convergence: params.convergence
    })
    .select()
    .single()

  if (error) throw error
  return data as MineTwin
}

export async function getMineTwin(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('mine_twins')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as MineTwin
}

export async function getMineTwins(projectId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('mine_twins')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as MineTwin[]
}

export async function addDailyScan(twinId: string, points: SurveyPoint3D[]) {
  const supabase = await createClient()
  const { data: twin, error: fetchError } = await supabase
    .from('mine_twins')
    .select('daily_scans')
    .eq('id', twinId)
    .single()

  if (fetchError || !twin) throw new Error('Twin not found')

  const scans = (twin as any).daily_scans || []
  scans.push(points)

  const { data, error } = await supabase
    .from('mine_twins')
    .update({ daily_scans: scans, updated_at: new Date().toISOString() })
    .eq('id', twinId)
    .select()
    .single()

  if (error) throw error
  return data as MineTwin
}
