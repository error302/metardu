import { NextRequest, NextResponse } from 'next/server'
import { callPythonCompute } from '@/lib/compute/pythonService'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = await callPythonCompute('terrain', body)
    if (result.ok) {
      return NextResponse.json(result.value)
    } else {
      const err = result as { ok: false; status: number; error: string }
      return NextResponse.json({ error: err.error }, { status: err.status })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
