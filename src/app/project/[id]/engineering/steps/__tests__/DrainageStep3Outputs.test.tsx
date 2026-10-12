/** @jest-environment jsdom */

import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import type { DrainageData } from '@/types/engineering'
import { SRID_21037 } from '@/lib/map/projectionConstants'
import { DrainageStep3Outputs } from '../DrainageStep3Outputs'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const drainageData = (originEasting = 500000): DrainageData => ({
  projectCrs: SRID_21037,
  minimumCoverM: 1.2,
  setoutIntervalM: 50,
  manholes: [
    {
      id: 'A', name: 'MH-A', chainage: 100, easting: originEasting, northing: 9800000,
      coverLevel: 102, invertLevelOut: 100, pipeDiameterOut: 300,
      pipeOutsideDiameterOut: 315, pipeMaterial: 'Concrete',
    },
    {
      id: 'B', name: 'MH-B', chainage: 200, easting: originEasting + 100, northing: 9800000,
      coverLevel: 101, invertLevelIn: 99,
    },
  ],
})

describe('DrainageStep3Outputs coordinate review', () => {
  let host: HTMLDivElement
  let root: Root
  let originalFetch: typeof fetch

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    originalFetch = global.fetch
    mockPush.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    global.fetch = originalFetch
  })

  const render = (data: DrainageData) => {
    act(() => root.render(<DrainageStep3Outputs data={data} projectId="project-1" />))
  }

  it('does not present out-of-domain UTM coordinates as a ready field schedule', () => {
    render(drainageData(100))

    expect(host.textContent).toMatch(/outside the UTM easting domain/i)
    expect(host.textContent).not.toContain('DR-00001')
    expect([...host.querySelectorAll('button')].some(button => button.textContent?.includes('Create / refresh field set-out'))).toBe(false)
  })

  it('shows the project pipe free-surface screen and requires pressure analysis above its peak', () => {
    const data = drainageData()
    data.manholes[0].designFlowOutLs = 100
    render(data)
    expect(host.textContent).toMatch(/Above full-bore rate; near-crown free-surface flow/)
    expect(host.textContent).toMatch(/Uniform-flow normal-depth estimate:/)
    expect(host.textContent).toMatch(/Open-channel maximum:/)

    data.manholes[0].designFlowOutLs = 110
    render(data)
    expect(host.textContent).toMatch(/Exceeds open-channel capacity; pressure-flow analysis required/)
    expect(host.textContent).toMatch(/Free-surface depth and Froude number are not assessed/)
  })

  it('holds the field handoff until a returned coordinate warning is reviewed', async () => {
    render(drainageData(850000))
    expect(host.textContent).toMatch(/outside the nominal UTM strip/i)

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { definitionId: 'definition-1', coordinateWarnings: ['Verify the declared UTM zone.'] } }),
    }) as unknown as typeof fetch

    const create = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Create / refresh field set-out'))
    expect(create).toBeDefined()
    await act(async () => {
      create?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(host.textContent).toMatch(/Verify the declared UTM zone/i)
    expect(mockPush).not.toHaveBeenCalled()

    const openAfterReview = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Open field job after review'))
    expect(openAfterReview).toBeDefined()
    act(() => openAfterReview?.click())
    expect(mockPush).toHaveBeenCalledWith('/field/setout?projectId=project-1&definitionId=definition-1')
  })
})
