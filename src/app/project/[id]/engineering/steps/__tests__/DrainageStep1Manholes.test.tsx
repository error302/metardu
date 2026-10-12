/** @jest-environment jsdom */

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DrainageData, Manhole } from '@/types/engineering'
import { SRID_21037 } from '@/lib/map/projectionConstants'
import { DrainageStep1Manholes } from '../DrainageStep1Manholes'

type Save = (
  manholes: Manhole[],
  settings: Pick<DrainageData, 'projectCrs' | 'minimumCoverM' | 'setoutIntervalM' | 'setoutStartChainageM' | 'setoutToleranceProfile'>,
) => void | Promise<boolean>

describe('DrainageStep1Manholes save state', () => {
  let host: HTMLDivElement
  let root: Root
  let originalFetch: typeof fetch

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })
    originalFetch = global.fetch
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    global.fetch = originalFetch
  })

  const renderStep = (onSave: Save, data: DrainageData = { manholes: [{ id: 'MH1', name: 'MH1' }] }, projectId?: string) => {
    act(() => {
      root.render(
        <DrainageStep1Manholes
          data={data}
          projectId={projectId}
          onSave={onSave}
        />,
      )
    })
    const saveButton = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Save Manhole Inputs'))
    if (!saveButton) throw new Error('The drainage save button did not render.')
    return saveButton
  }

  it('shows success only after the project save resolves', async () => {
    let resolveSave!: (saved: boolean) => void
    const onSave: Save = jest.fn(() => new Promise<boolean>(resolve => { resolveSave = resolve }))
    const button = renderStep(onSave)

    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(button.textContent).toContain('Saving')
    expect(host.textContent).not.toContain('Manhole inputs saved to the project.')

    await act(async () => {
      resolveSave(true)
      await Promise.resolve()
    })

    expect(host.textContent).toContain('Manhole inputs saved to the project.')
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('shows an error and no saved state when persistence fails', async () => {
    const onSave: Save = jest.fn().mockResolvedValue(false)
    const button = renderStep(onSave)

    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not save these inputs')
    expect(host.textContent).not.toContain('Manhole inputs saved to the project.')
  })

  it('saves intermediate route vertices with their outgoing manhole', async () => {
    const onSave: Save = jest.fn().mockResolvedValue(true)
    const button = renderStep(onSave, {
      projectCrs: SRID_21037,
      minimumCoverM: 1.2,
      setoutIntervalM: 5,
      manholes: [
        { id: 'A', name: 'MH-A', chainage: 100, easting: 500000, northing: 9800000, coverLevel: 102, invertLevelOut: 100, pipeDiameterOut: 300, pipeOutsideDiameterOut: 315, pipeMaterial: 'Concrete' },
        { id: 'B', name: 'MH-B', chainage: 120, easting: 500010, northing: 9800010, coverLevel: 101, invertLevelIn: 99.8 },
      ],
    })
    const textarea = host.querySelector('#mh-0-alignment-vertices') as HTMLTextAreaElement
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set

    await act(async () => {
      valueSetter?.call(textarea, '500010,9800000')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'A',
          alignmentVerticesOut: [{ easting: 500010, northing: 9800000 }],
        }),
      ]),
      expect.any(Object),
    )
  })

  it('imports a saved map line in downstream order and saves its source provenance', async () => {
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        projectCrs: SRID_21037,
        warnings: [],
        alignments: [{
          featureKey: 'map-line:storm-main:abc123',
          label: 'Storm main',
          sourceCrs: 'EPSG:4326',
          projectCrs: SRID_21037,
          vertices: [
            { easting: 500010, northing: 9800010 },
            { easting: 500010, northing: 9800000 },
            { easting: 500000, northing: 9800000 },
          ],
        }],
      }),
    } as Response)
    global.fetch = fetchMock
    const savedInputs: { manholes: Manhole[] | null } = { manholes: null }
    const onSave: Save = jest.fn(async manholes => {
      savedInputs.manholes = manholes
      return true
    })
    const button = renderStep(onSave, {
      projectCrs: SRID_21037,
      minimumCoverM: 1.2,
      setoutIntervalM: 5,
      manholes: [
        { id: 'A', name: 'MH-A', chainage: 100, easting: 500000, northing: 9800000, coverLevel: 102, invertLevelOut: 100, pipeOutsideDiameterOut: 315 },
        { id: 'B', name: 'MH-B', chainage: 120, easting: 500010, northing: 9800010, coverLevel: 101, invertLevelIn: 99.8 },
      ],
    }, 'project-1')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const alignmentSelect = host.querySelector('#mh-0-saved-map-alignment') as HTMLSelectElement
    expect(alignmentSelect).not.toBeNull()
    const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
    await act(async () => {
      selectValue?.call(alignmentSelect, 'map-line:storm-main:abc123')
      alignmentSelect.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    expect(host.textContent).toContain('Map source: Storm main · reversed')

    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(savedInputs.manholes?.[0]).toMatchObject({
      id: 'A',
      alignmentVerticesOut: [{ easting: 500010, northing: 9800000 }],
      alignmentSourceOut: {
        kind: 'saved_project_map_line',
        featureKey: 'map-line:storm-main:abc123',
        orientation: 'reversed',
        startConnectorM: 0,
        endConnectorM: 0,
      },
    })

    const textarea = host.querySelector('#mh-0-alignment-vertices') as HTMLTextAreaElement
    const textareaValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    await act(async () => {
      textareaValue?.call(textarea, '')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await Promise.resolve()
    })
    expect((host.querySelector('#mh-0-saved-map-alignment') as HTMLSelectElement).value).toBe('')
    await act(async () => {
      button.click()
      await Promise.resolve()
    })
    expect(savedInputs.manholes?.[0]?.alignmentSourceOut).toBeUndefined()
    expect(savedInputs.manholes?.[0]?.alignmentVerticesOut).toBeUndefined()
  })

  it('does not save malformed alignment text as a straight pipe', async () => {
    const onSave: Save = jest.fn().mockResolvedValue(true)
    const button = renderStep(onSave, {
      manholes: [
        { id: 'A', name: 'MH-A' },
        { id: 'B', name: 'MH-B' },
      ],
    })
    const textarea = host.querySelector('#mh-0-alignment-vertices') as HTMLTextAreaElement
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set

    await act(async () => {
      valueSetter?.call(textarea, '500010')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(onSave).not.toHaveBeenCalled()
    expect(host.textContent).toMatch(/exactly two comma-separated values/i)
  })
})
