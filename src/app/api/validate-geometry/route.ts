import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      road_class = 'DR1',
      terrain = 'flat',
      design_speed = 80,
      proposed_gradient = 3,
      proposed_radius = 240,
      proposed_ssd,
      superelevation = 8.0,
    } = body

    const script = `
import sys
sys.path.insert(0, 'src/lib/python')
from geometric_validator import validate_geometry
result = validate_geometry(
    road_class="${road_class}",
    terrain="${terrain}",
    design_speed=float(${design_speed}),
    proposed_gradient=float(${proposed_gradient}),
    proposed_radius=float(${proposed_radius}),
    proposed_ssd=${proposed_ssd !== undefined ? proposed_ssd : 'None'},
    superelevation=float(${superelevation}),
)
import json
print(json.dumps(result))
`

    const output = await runPython(script)
    return NextResponse.json(JSON.parse(output))
  } catch (err) {
    return NextResponse.json({ status: 'ERROR', flags: ['Validation service unavailable'] }, { status: 500 })
  }
}

function runPython(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', ['-c', script])
    let output = ''
    let error = ''
    proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { error += d.toString() })
    proc.on('close', (code: number) => {
      if (code !== 0) {
        reject(new Error(error || `Python exited with code ${code}`))
      } else {
        resolve(output)
      }
    })
  })
}
