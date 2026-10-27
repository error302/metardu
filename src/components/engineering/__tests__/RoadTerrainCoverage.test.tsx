import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RoadWorkbench from '../RoadWorkbench'
import { roadWorkbenchExample } from '@/lib/engineering/roadWorkbenchExample'
import type { RoadTerrainData } from '@/lib/engineering/roadTerrain'
import { assessRoadTerrainCoverage, type RoadTerrainCoverage } from '@/lib/engineering/roadTerrainCoverage'
jest.mock('../RoadWorkbench3D', () => ({ __esModule: true, default: () => <div aria-label="Synthetic terrain scene" /> }))
jest.mock('@/lib/engineering/roadTerrainCoverage', () => ({ assessRoadTerrainCoverage: jest.fn() }))
const { road: original, reference } = roadWorkbenchExample()
const identity: RoadTerrainData['identity'] = { projectId: '10000000-0000-4000-8000-000000000001', surfaceId: '10000000-0000-4000-8000-000000000002', revisionId: '10000000-0000-4000-8000-000000000003', revision: 1, name: 'Synthetic terrain', inputHash: 'a'.repeat(64), meshHash: 'b'.repeat(64), referenceHash: 'c'.repeat(64), crs: reference.code, verticalDatum: reference.verticalDatum, fieldVerified: false }
const terrain: RoadTerrainData = { identity, mesh: { points: [{ x: 499900, y: 9499900, z: 100 }, { x: 500400, y: 9499900, z: 100 }, { x: 500400, y: 9500400, z: 100 }, { x: 499900, y: 9500400, z: 100 }], triangles: [{ a: 0, b: 1, c: 2 }, { a: 0, b: 2, c: 3 }] } }
const road = { ...original, retainedTerrain: { ...identity, intervalM: 20, halfWidthM: 20 } }
function verdict(reason: string, status: RoadTerrainCoverage['status'] = 'covered'): RoadTerrainCoverage {
  return { status, reason, algorithm: 'retained-tin-strip-enclosures', algorithmVersion: '1.0.0', fieldVerified: false, start: 0, end: 200, halfWidthM: 20, checkedEnclosures: 3 }
}
it('cancels a changed design and never displays its late coverage verdict', async () => {
  const pending: Array<{ finish: (result: RoadTerrainCoverage) => void; signal?: AbortSignal }> = []
  jest.mocked(assessRoadTerrainCoverage).mockImplementation((_road, _ref, _mesh, _width, signal) => new Promise(resolve => pending.push({ finish: resolve, signal })))
  const view = render(<RoadWorkbench road={road} reference={reference} terrain={terrain} />)
  fireEvent.click(screen.getByRole('button', { name: 'Retained terrain (computed)' }))
  expect(screen.getByLabelText('Continuous terrain coverage')).toHaveTextContent('Checking')
  expect(pending).toHaveLength(1)
  const changed = { ...road, ips: road.ips.map(p => ({ ...p, easting: p.easting + 1 })) }
  view.rerender(<RoadWorkbench road={changed} reference={reference} terrain={terrain} />)
  expect(pending[0].signal?.aborted).toBe(true)
  await act(async () => { pending[0].finish(verdict('OLD STRIP COVERED')) })
  expect(screen.getByLabelText('Continuous terrain coverage')).not.toHaveTextContent('OLD STRIP')
  await act(async () => { pending[1].finish(verdict('New strip intersects a terrain exclusion.', 'unassessed')) })
  expect(screen.getByLabelText('Continuous terrain coverage')).toHaveTextContent('Coverage unassessed: New strip')
  expect(screen.getByLabelText('Terrain preview cut volume')).toHaveTextContent('Unassessed')
})
it('revokes a displayed verdict immediately when the retained mesh disappears', async () => {
  jest.mocked(assessRoadTerrainCoverage).mockResolvedValue(verdict('Full review strip covered.'))
  const view = render(<RoadWorkbench road={road} reference={reference} terrain={terrain} />)
  fireEvent.click(screen.getByRole('button', { name: 'Retained terrain (computed)' }))
  await waitFor(() => expect(screen.getByLabelText('Continuous terrain coverage')).toHaveTextContent('Full review strip covered'))
  view.rerender(<RoadWorkbench road={road} reference={reference} />)
  expect(screen.getByLabelText('Continuous terrain coverage')).toHaveTextContent('Load the exact selected terrain')
  expect(screen.getByLabelText('Continuous terrain coverage')).not.toHaveTextContent('Full review strip covered')
})
it('aborts an unfinished check when leaving computed mode or unmounting', () => {
  let signal: AbortSignal | undefined
  jest.mocked(assessRoadTerrainCoverage).mockImplementation((_road, _ref, _mesh, _width, current) => { signal = current; return new Promise(() => {}) })
  const view = render(<RoadWorkbench road={road} reference={reference} terrain={terrain} />)
  fireEvent.click(screen.getByRole('button', { name: 'Retained terrain (computed)' }))
  const first = signal
  fireEvent.click(screen.getByRole('button', { name: 'Measured sections' }))
  expect(first?.aborted).toBe(true)
  expect(screen.queryByLabelText('Continuous terrain coverage')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retained terrain (computed)' }))
  view.unmount()
  expect(signal?.aborted).toBe(true)
})
