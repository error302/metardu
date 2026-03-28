import { Node } from 'reactflow'

export type WorkflowNodeType = 
  | 'fieldbook' 
  | 'fieldguard' 
  | 'cadastra' 
  | 'developPlan' 
  | 'validate' 
  | 'approve' 
  | 'export'

export interface WorkflowNode extends Node {
  data: {
    label: string
    type: WorkflowNodeType
    config?: Record<string, unknown>
  }
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  type?: string
  animated?: boolean
  data?: {
    label?: string
  }
}

export interface Workflow {
  id: string
  project_id: string
  user_id: string
  name: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  status: 'draft' | 'running' | 'completed' | 'failed'
  created_at: string
  updated_at: string
}

export interface WorkflowExecution {
  workflow_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  results: Record<string, unknown>
  error?: string
}

export interface ReportRequest {
  project_id: string
  workflow_id?: string
  sections?: string[]
  style?: 'technical' | 'executive' | 'simple'
}

export interface ReportResponse {
  content: string
  sections: string[]
  word_count: number
}
