// src/lib/dbClient/cadastraValidations.ts

import { createClient } from '@/lib/api-client/server'
import type { CadastraValidation, BoundaryPolygon } from '@/types/cadastra'

export async function createValidation(params: {
  project_id: string
  user_id: string
  boundary_data: BoundaryPolygon
  score: number
  overlaps: any[]
  gaps: any[]
  report_url?: string
}) {
  const dbClient = await createClient()
  const { data, error } = await dbClient
    .from('cadastra_validations')
    .insert({
      project_id: params.project_id,
      user_id: params.user_id,
      boundary_data: params.boundary_data,
      score: params.score,
      overlaps: params.overlaps,
      gaps: params.gaps,
      report_url: params.report_url
    })
    .select()
    .single()

  if (error) throw error
  return data as CadastraValidation
}

export async function getValidations(projectId: string) {
  const dbClient = await createClient()
  const { data, error } = await dbClient
    .from('cadastra_validations')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as CadastraValidation[]
}

export async function getValidation(id: string) {
  const dbClient = await createClient()
  const { data, error } = await dbClient
    .from('cadastra_validations')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as CadastraValidation
}
