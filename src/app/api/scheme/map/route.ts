import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { AppError } from '@/lib/api/errors'
import {
  readSchemeExtent,
  readSchemeViewport,
} from '@/lib/scheme/readSchemeView'
export const dynamic = 'force-dynamic'
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 120, windowMs: 60000 } },
  async (request, ctx) => {
    const q = new URL(request.url).searchParams
    if (
      ['project_id', 'mode', 'bbox', 'cellSize'].some(
        (key) => q.getAll(key).length > 1,
      )
    )
      throw new AppError('Choose one project, mode and viewport.', 400)
    const project = q.get('project_id') ?? ''
    if (q.get('mode') === 'extent' && !q.has('bbox') && !q.has('cellSize'))
      return NextResponse.json(await readSchemeExtent(ctx.userId, project), {
        headers: { 'Cache-Control': 'private, no-store' },
      })
    if (q.has('mode') || !q.has('bbox') || !q.has('cellSize'))
      throw new AppError(
        'Choose mode=extent or a project-grid bbox and cellSize.',
        400,
      )
    const parts = (q.get('bbox') ?? '').split(',')
    if (parts.length !== 4 || parts.some((value) => !value.trim()))
      throw new AppError('A finite viewport is required.', 400)
    const bbox = parts.map(Number) as [number, number, number, number]
    return NextResponse.json(
      await readSchemeViewport(ctx.userId, project, {
        bbox,
        cellSize: Number(q.get('cellSize')),
      }),
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  },
)
