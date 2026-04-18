// src/lib/dbClient/workflows.ts

import { createClient } from '@/lib/api-client/server'
import type { Workflow, WorkflowNode, WorkflowEdge } from '@/types/workflow'

export async function createWorkflow(params: {
  project_id: string
  user_id: string
  name: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}) {
  const dbClient = await createClient()
  const { data, error } = await dbClient
    .from('workflows')
    .insert({
      project_id: params.project_id,
      user_id: params.user_id,
      name: params.name,
      nodes: params.nodes,
      edges: params.edges,
      status: 'draft'
    })
    .select()
    .single()

  if (error) throw error
  return data as Workflow
}

export async function getWorkflows(projectId: string) {
  const dbClient = await createClient()
  const { data, error } = await dbClient
    .from('workflows')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as Workflow[]
}

export async function getWorkflow(id: string) {
  const dbClient = await createClient()
  const { data, error } = await dbClient
    .from('workflows')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Workflow
}

export async function updateWorkflow(id: string, updates: Partial<Workflow>) {
  const dbClient = await createClient()
  const { data, error } = await dbClient
    .from('workflows')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Workflow
}
