'use client';

// SurveyFlow Automator — page.
//
// AUDIT FIX (2026-07-03): Previously the page-level "Run Workflow"
// button called handleRunWorkflow([], []) with empty arrays because
// the nodes/edges state lived inside WorkflowCanvas. Now nodes/edges
// are lifted to this page (via useNodesState/useEdgesState hooks)
// and passed down to the canvas, so:
//   - The page-level "Run Workflow" button sees the live workflow.
//   - "Generate Report" now uses the actual workflow nodes as the
//     report context instead of `{ project: 'test' }`.
//   - Results are rendered structurally (steps + summary) instead
//     of raw JSON.stringify, with a fallback to JSON for unexpected
//     shapes.

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { executeWorkflow, generateReport } from '@/lib/compute/workflowEngine'
import { Play, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import ReactFlow, {
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
} from 'reactflow'
import 'reactflow/dist/style.css'

const WorkflowCanvas = dynamic(
  () => import('@/components/automator/WorkflowCanvas'),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse bg-[var(--bg-secondary)] rounded-lg h-96 flex items-center justify-center text-[var(--text-muted)]">
        Loading workflow canvas...
      </div>
    ),
  },
)

export default function AutomatorPage() {
  // Lifted state — page owns the workflow
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<
    | { kind: 'workflow'; data: unknown }
    | { kind: 'report'; data: unknown }
    | null
  >(null)
  const [error, setError] = useState<string | null>(null)

  // Wrap the change handlers so they match the OnNodesChange /
  // OnEdgesChange signatures the canvas expects.
  const handleNodesChange: OnNodesChange = (chg) => {
    setNodes((nds) => ReactFlow.applyNodeChanges(chg, nds) as Node[])
  }
  const handleEdgesChange: OnEdgesChange = (chg) => {
    setEdges((eds) => ReactFlow.applyEdgeChanges(chg, eds) as Edge[])
  }

  const handleRunWorkflow = async () => {
    setRunning(true)
    setError(null)
    try {
      if (nodes.length === 0) {
        setError('Add at least one node to the canvas before running the workflow.')
        return
      }
      const result = await executeWorkflow(nodes as unknown as Parameters<typeof executeWorkflow>[0], edges as unknown as Parameters<typeof executeWorkflow>[1])
      setResults({ kind: 'workflow', data: result })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workflow execution failed')
    } finally {
      setRunning(false)
    }
  }

  const handleGenerateReport = async () => {
    setRunning(true)
    setError(null)
    try {
      // Use the live workflow nodes as the report context.
      const context = {
        project: 'workflow-' + new Date().toISOString().slice(0, 10),
        node_count: nodes.length,
        edge_count: edges.length,
        node_types: nodes.map((n) => (n.data as { nodeType?: string } | undefined)?.nodeType ?? 'unknown'),
      }
      const report = await generateReport(
        context,
        ['summary', 'methodology', 'results', 'recommendations'],
        'technical',
      )
      setResults({ kind: 'report', data: report })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report generation failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">SurveyFlow Automator</h1>
        <p className="text-[var(--text-muted)]">
          Design a survey-submission workflow as a node graph, then run it end-to-end
          and generate a technical report.
        </p>
      </div>

      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-4 mb-4">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleRunWorkflow}
            disabled={running || nodes.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            title={nodes.length === 0 ? 'Add nodes to the canvas first' : 'Run the workflow end-to-end'}
          >
            {running ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
            Run Workflow
          </button>

          <button
            onClick={handleGenerateReport}
            disabled={running || nodes.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            title={nodes.length === 0 ? 'Add nodes to the canvas first' : 'Generate a technical report from the workflow'}
          >
            <FileText className="h-5 w-5" />
            Generate Report
          </button>

          <div className="ml-auto flex items-center gap-3 text-sm text-[var(--text-muted)]">
            <span>{nodes.length} nodes</span>
            <span>·</span>
            <span>{edges.length} edges</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-400">Could not run</p>
            <p className="text-sm text-red-300 mt-1">{error}</p>
          </div>
        </div>
      )}

      <div className="h-[600px] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg overflow-hidden">
        <WorkflowCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onEdgesAdd={(newEdges) => setEdges(newEdges)}
        />
      </div>

      {results && (
        <div className="mt-6 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <h3 className="text-lg font-semibold">
              {results.kind === 'workflow' ? 'Workflow Result' : 'Generated Report'}
            </h3>
          </div>

          <ResultRenderer data={results.data} kind={results.kind} />
        </div>
      )}
    </div>
  )
}

// ─── Result rendering ───────────────────────────────────────────────────────
//
// We try to render results structurally (workflow steps / report
// sections). If the shape is unexpected, we fall back to a <pre>
// JSON dump so the user at least sees something.

function ResultRenderer({ data, kind }: { data: unknown; kind: 'workflow' | 'report' }) {
  if (kind === 'workflow') {
    const wf = data as {
      steps?: Array<{ node?: string; status?: string; output?: unknown }>
      summary?: Record<string, unknown>
    } | null

    if (wf?.steps && Array.isArray(wf.steps)) {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            {wf.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-[var(--bg-primary)] rounded-lg">
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/15 text-blue-400">
                  Step {i + 1}
                </span>
                <div className="flex-1">
                  <div className="font-medium text-[var(--text-primary)]">{step.node ?? 'unknown'}</div>
                  <div className="text-sm text-[var(--text-muted)]">Status: {step.status ?? '—'}</div>
                  {step.output != null && (
                    <pre className="mt-2 text-xs bg-[var(--bg-tertiary)] p-2 rounded overflow-x-auto">
                      {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
          {wf.summary && (
            <div className="p-3 bg-[var(--bg-primary)] rounded-lg">
              <p className="text-sm font-medium mb-2">Summary</p>
              <pre className="text-xs overflow-x-auto">{JSON.stringify(wf.summary, null, 2)}</pre>
            </div>
          )}
        </div>
      )
    }
  }

  if (kind === 'report') {
    const rep = data as {
      sections?: Array<{ title?: string; content?: string }>
      content?: string
    } | null

    if (rep?.sections && Array.isArray(rep.sections)) {
      return (
        <div className="space-y-4">
          {rep.sections.map((s, i) => (
            <div key={i}>
              <h4 className="font-semibold text-[var(--text-primary)] mb-1">{s.title ?? `Section ${i + 1}`}</h4>
              <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{s.content ?? ''}</p>
            </div>
          ))}
        </div>
      )
    }
    if (typeof rep?.content === 'string') {
      return <pre className="text-sm whitespace-pre-wrap">{rep.content}</pre>
    }
  }

  // Fallback: raw JSON
  return (
    <pre className="bg-[var(--bg-primary)] p-4 rounded overflow-x-auto text-sm">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}
