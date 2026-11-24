/** @jest-environment jsdom */

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Step1Setup } from '../Step1Setup'
import { horizontalCrsFor } from '@/lib/spatial/projectReferenceSystem'
import type { EngineeringProject } from '../../shared'

/**
 * The engineering setup step draws in the project's own grid. Its coordinate
 * system is auto-filled from the project's declaration, never from a national
 * default, and the surveyor can still change it.
 */
describe('Step1Setup coordinate system', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const project = (overrides: Partial<EngineeringProject> = {}): EngineeringProject => ({
    id: 'project-1',
    name: 'Synthetic road',
    survey_type: 'road',
    utm_zone: 37,
    hemisphere: 'S',
    datum: 'Arc 1960',
    ...overrides,
  })

  const renderStep = (overrides: Partial<EngineeringProject> = {}) => {
    act(() => {
      root.render(
        <Step1Setup
          project={project(overrides)}
          data={null}
          onSave={jest.fn()}
          mode="road"
          onModeChange={jest.fn()}
        />,
      )
    })
    return host.querySelector('select[aria-label="Coordinate system (project reference)"]') as HTMLSelectElement
  }

  it('auto-fills the declared project reference system', () => {
    const picker = renderStep()
    expect(picker.value).toBe(horizontalCrsFor('ARC1960', 37, 'S'))
    expect(host.textContent).toMatch(/Auto-filled from the project declaration/i)
  })

  it('auto-fills a WGS 84 project with its own code, not an Arc 1960 one', () => {
    const picker = renderStep({ datum: 'WGS 84', utm_zone: 36, hemisphere: 'N' })
    expect(picker.value).toBe(horizontalCrsFor('WGS84', 36, 'N'))
  })

  it('leaves the reference unset when the project declared none', () => {
    const picker = renderStep({ datum: undefined, utm_zone: 37, hemisphere: 'S' })
    expect(picker.value).toBe('')
    expect(host.textContent).not.toMatch(/Auto-filled from the project declaration/i)
  })
})
