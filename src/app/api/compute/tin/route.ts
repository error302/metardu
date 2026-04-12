import { NextRequest, NextResponse } from 'next/server'

import { callPythonCompute } from '@/lib/compute/pythonService'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const python = await callPythonCompute<any>('/surface/tin', body, { timeoutMs: 15000 })
  if (!python.ok) {
    const err = python as { ok: false; status: number; error: string; fallback?: boolean; details?: unknown }
    return NextResponse.json(
      { error: err.error, fallback: err.fallback ?? true, details: err.details, python_required: true },
      { status: err.status }
    )
  }
  return NextResponse.json(python.value)
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/compute/tin',
    description: 'Triangulated Irregular Network generation (Python compute service).',
    python_required: true,
  })
}

