'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { z } from 'zod'
import DeedPlanGenerator from './DeedPlanGenerator'
import { createClient } from '@/lib/api-client/client'
import { resolveDocumentEvidence, type DocumentProject } from '@/lib/reports/documentEvidence'
import { readReferenceResponse } from '@/lib/spatial/referenceDeclaration'
import { describeCrs } from '@/lib/spatial/projectCrs'
import type { BoundaryPoint, DeedPlanInput } from '@/types/deedPlan'

type Grid = Pick<DeedPlanInput, 'datum' | 'utmZone' | 'hemisphere'>
type Source = { status: 'loading' } | { status: 'error'; message: string } |
  { status: 'ready'; points: BoundaryPoint[]; grid: Grid; notice?: string }

const bookSchema = z.object({ projectCrs: z.string(), revision: z.string().regex(/^[a-f0-9]{64}$/) })

export default function ProjectDeedPlan({ projectId }: { projectId: string }) {
  const [source, setSource] = useState<Source>({ status: 'loading' })
  const [attempt, retry] = useState(0)
  const back = '/project/' + encodeURIComponent(projectId) + '/documents'

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const projectPath = '/api/project/' + encodeURIComponent(projectId)
    async function load() {
      setSource({ status: 'loading' })
      try {
        const [project, reference] = await Promise.all([
          createClient().from('projects').select('id,name,boundary_data,area_sqm').eq('id', projectId).single(),
          fetch(projectPath + '/reference-system', { signal: controller.signal, cache: 'no-store' }),
        ])
        if (!reference.ok || project.error || !project.data) throw new Error('The project documents could not be loaded.')
        const { referenceSystem } = readReferenceResponse(await reference.json() as unknown)
        const info = referenceSystem && describeCrs(referenceSystem.prs.horizontalCrs)
        const datum = info?.datum === 'WGS 84' ? 'WGS84' : info?.datum === 'Arc 1960' ? 'ARC1960' : null
        if (!datum || !info?.zone || !info.hemisphere) throw new Error('Declare a supported UTM project grid before drafting the deed plan.')
        const grid: Grid = { datum, utmZone: info.zone, hemisphere: info.hemisphere }
        const record = project.data as unknown as DocumentProject
        const saved = record.boundary_data?.computation
        let points: BoundaryPoint[] = []
        let notice: string | undefined
        if (saved?.source === 'recorded-grid-traverse') {
          try {
            const response = await fetch(projectPath + '/fieldbook', { signal: controller.signal, cache: 'no-store' })
            const book = bookSchema.parse(await response.json() as unknown)
            if (!response.ok || book.projectCrs !== info.code) throw new Error('The current field-book reference could not be verified.')
            const evidence = resolveDocumentEvidence(record, [], { projectCrs: book.projectCrs, fieldBookRevision: book.revision })
            points = evidence.boundaryPoints.map(point => ({ id: point.name, easting: point.easting,
              northing: point.northing, elevation: point.elevation, markType: 'INDICATORY', markStatus: 'UNRECORDED' }))
          } catch (error) {
            notice = error instanceof Error ? error.message : 'The saved boundary could not be verified.'
          }
        }
        if (active) setSource({ status: 'ready', points, grid, notice })
      } catch (error) {
        if (active) setSource({ status: 'error', message: error instanceof Error ? error.message : 'Could not load project evidence.' })
      }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [projectId, attempt])

  if (source.status === 'loading') return <p className="p-6" role="status">Loading project grid and boundary…</p>
  if (source.status === 'error') return <div className="mx-auto max-w-4xl space-y-3 p-5">
    <p role="alert">{source.message}</p>
    <button type="button" className="btn btn-secondary" onClick={() => retry(value => value + 1)}>Retry</button>
    <Link className="ml-3 underline" href={back}>Project documents</Link>
  </div>

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-1 px-4 text-sm">
        <Link href={back} className="underline">Project documents</Link>
        <p className="text-[var(--text-secondary)]">{source.notice || (source.points.length
          ? 'Loaded the current field-book boundary in saved perimeter order. Review the coordinates and record any known beacon details.'
          : 'Enter or import reviewed boundary coordinates in perimeter order. The project point register can include observations outside the boundary.')}</p>
      </div>
      <DeedPlanGenerator key={projectId} projectId={projectId} initialPoints={source.points} initialGrid={source.grid} />
    </>
  )
}
