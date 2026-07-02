'use client';

// WorkflowCanvas — lifted-state version.
//
// Previously the page-level "Run Workflow" button called
// handleRunWorkflow([], []) with empty arrays because nodes/edges
// lived inside this component. Now nodes/edges are controlled by
// the parent page via props, so the page-level Run button can see
// the live workflow state.

import { useCallback } from 'react'
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Connection,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
} from 'reactflow'
import 'reactflow/dist/style.css'

const nodeTypes = [
  { type: 'fieldbook',   label: 'Fieldbook',           color: '#3b82f6' },
  { type: 'fieldguard',  label: 'FieldGuard AI',       color: '#10b981' },
  { type: 'cadastra',    label: 'Cadastra Validator',  color: '#8b5cf6' },
  { type: 'developPlan', label: 'Develop Plan',        color: '#f59e0b' },
  { type: 'validate',    label: 'Validate',            color: '#ef4444' },
  { type: 'approve',     label: 'Approve',             color: '#ec4899' },
  { type: 'export',      label: 'Export',              color: '#06b6d4' },
]

export interface WorkflowCanvasProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onEdgesAdd: (edges: Edge[]) => void
}

export default function WorkflowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onEdgesAdd,
}: WorkflowCanvasProps) {
  // useNodesState/useEdgesState give us the change handlers; we pass
  // the live state in from the parent so the page can read it too.
  const [, , localOnNodesChange] = useNodesState(nodes)
  const [, , localOnEdgesChange] = useEdgesState(edges)

  const onConnect = useCallback(
    (params: Connection) => {
      onEdgesAdd(addEdge(params, edges))
    },
    [edges, onEdgesAdd],
  )

  return (
    <div className="flex h-full">
      <div className="w-64 bg-[var(--bg-secondary)] p-4 border-r border-[var(--border-color)]">
        <h3 className="font-semibold mb-4 text-[var(--text-primary)]">Node Types</h3>
        <div className="space-y-2">
          {nodeTypes.map((nt) => (
            <div
              key={nt.type}
              className="p-2 rounded cursor-move text-white text-sm"
              style={{ backgroundColor: nt.color }}
              title={`Drag to canvas to add a ${nt.label} node (not yet wired — use Add Node)`}
              onClick={() => {
                // Convenience click-to-add (drag is harder without a
                // custom dnd library). Append a new node at a pseudo-
                // random offset so multiple clicks don't stack.
                const newNode: Node = {
                  id: `${nt.type}-${Date.now()}`,
                  type: 'default',
                  position: {
                    x: 100 + Math.random() * 300,
                    y: 100 + Math.random() * 200,
                  },
                  data: { label: nt.label, nodeType: nt.type },
                }
                onNodesChange({
                  type: 'add',
                  item: newNode,
                } as unknown as Parameters<OnNodesChange>[0])
              }}
            >
              {nt.label}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(chg) => {
            localOnNodesChange(chg)
            onNodesChange(chg)
          }}
          onEdgesChange={(chg) => {
            localOnEdgesChange(chg)
            onEdgesChange(chg)
          }}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}
