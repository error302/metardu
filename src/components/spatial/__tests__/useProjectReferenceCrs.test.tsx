import { render, screen, waitFor } from '@testing-library/react'
import { applyDeclaredCrsIfEmpty, useProjectReferenceCrs } from '../useProjectReferenceCrs'
import { buildProjectReferenceSystem, horizontalCrsFor } from '@/lib/spatial/projectReferenceSystem'

/**
 * Auto-apply authority: the declared project reference system flows to every
 * project-bound form; a missing declaration is reported, never substituted.
 */

// CRS codes derive from the declaration authority — never hardcoded literals.
const ARC_1960_37S = horizontalCrsFor('ARC1960', 37, 'S')
const ARC_1960_36S = horizontalCrsFor('ARC1960', 36, 'S')

const declaredRecord = {
  prs: buildProjectReferenceSystem({ datum: 'ARC1960', utmZone: 37, hemisphere: 'S', verticalDatum: 'Nairobi 1962' }),
}

function Harness({ projectId }: { projectId: string | null }) {
  const state = useProjectReferenceCrs(projectId)
  return (
    <p data-testid="state">
      {state.crs ?? 'null'}|{state.source}|{state.verticalDatum ?? 'null'}
    </p>
  )
}

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
})

afterEach(() => {
  jest.restoreAllMocks()
})

it('resolves the declared project CRS through the stage-reference authority', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ data: { referenceSystem: declaredRecord, referenceHash: 'a'.repeat(64) } }),
  })
  render(<Harness projectId="p1" />)
  await waitFor(() => expect(screen.getByTestId('state').textContent).toBe(`${ARC_1960_37S}|declared|Nairobi 1962`))
  expect(global.fetch).toHaveBeenCalledWith('/api/project/p1/reference-system', { cache: 'no-store' })
})

it('reports a project with no declaration instead of substituting a default', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ data: { referenceSystem: null, referenceHash: 'a'.repeat(64) } }),
  })
  render(<Harness projectId="p1" />)
  await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('null|missing|null'))
})

it('degrades to missing on a failed request — never a guessed CRS', async () => {
  ;(global.fetch as jest.Mock).mockRejectedValue(new Error('offline'))
  render(<Harness projectId="p1" />)
  await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  expect(screen.getByTestId('state').textContent).toBe('null|missing|null')
})

it('never fetches without a project', () => {
  render(<Harness projectId={null} />)
  expect(screen.getByTestId('state').textContent).toBe('null|missing|null')
  expect(global.fetch).not.toHaveBeenCalled()
})

describe('applyDeclaredCrsIfEmpty', () => {
  it('applies the declared code only to an empty field', () => {
    expect(applyDeclaredCrsIfEmpty('', { crs: ARC_1960_37S, source: 'declared', verticalDatum: null })).toBe(ARC_1960_37S)
    expect(applyDeclaredCrsIfEmpty('  ', { crs: ARC_1960_37S, source: 'declared', verticalDatum: null })).toBe(ARC_1960_37S)
    expect(applyDeclaredCrsIfEmpty(ARC_1960_36S, { crs: ARC_1960_37S, source: 'declared', verticalDatum: null })).toBeNull()
  })

  it('applies nothing when the project has no declaration', () => {
    expect(applyDeclaredCrsIfEmpty('', { crs: null, source: 'missing', verticalDatum: null })).toBeNull()
  })
})
