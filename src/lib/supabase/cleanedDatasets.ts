// src/lib/supabase/cleanedDatasets.ts

import { createClient } from '@/lib/supabase/server'
import type { CleanedDataset, RawSurveyPoint, CleanedPoint, Anomaly } from '@/types/fieldguard'

export async function createCleanedDataset(params: {
  project_id: string
  user_id: string
  raw_data: RawSurveyPoint[]
  cleaned_data: CleanedPoint[]
  anomalies: Anomaly[]
  confidence_scores: Record<string, number>
  data_type: 'gnss' | 'totalstation' | 'lidar'
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cleaned_datasets')
    .insert({
      project_id: params.project_id,
      user_id: params.user_id,
      raw_data: params.raw_data,
      cleaned_data: params.cleaned_data,
      anomalies: params.anomalies,
      confidence_scores: params.confidence_scores,
      data_type: params.data_type
    })
    .select()
    .single()

  if (error) throw error
  return data as CleanedDataset
}

export async function getCleanedDatasets(projectId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cleaned_datasets')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as CleanedDataset[]
}

export async function getCleanedDataset(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cleaned_datasets')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as CleanedDataset
}

export async function deleteCleanedDataset(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cleaned_datasets')
    .delete()
    .eq('id', id)

  if (error) throw error
}
