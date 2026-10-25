/** @jest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import DynamicFieldBook from '@/components/workspace/DynamicFieldBook'

beforeAll(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const originalFetch = global.fetch
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [], revision: 'a'.repeat(64) }) })
})
afterEach(() => { global.fetch = originalFetch })

describe('DynamicFieldBook Virtualization', () => {
  it('renders standard table rows when under 50 rows', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const testRows = Array.from({ length: 5 }, (_, i) => ({
      station: `STN${i + 1}`,
      bearing: '045°00\'00"',
      distance: '100.000',
    }))

    await act(async () => {
      root.render(
        <DynamicFieldBook
          projectId="test-proj"
          surveyType="cadastral"
          initialRows={testRows}
        />
      )
    })

    expect(host.textContent).toContain('5 rows')
    expect(host.textContent).not.toMatch(/Showing \d+ of \d+ stations/)
    expect(host.querySelectorAll('tbody tr')).toHaveLength(5)

    await act(async () => root.unmount())
    host.remove()
  })

  it('activates virtualized windowing when row count exceeds 50', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const testRows = Array.from({ length: 80 }, (_, i) => ({
      station: `STN${i + 1}`,
      bearing: '045°00\'00"',
      distance: '100.000',
    }))

    await act(async () => {
      root.render(
        <DynamicFieldBook
          projectId="test-proj"
          surveyType="cadastral"
          initialRows={testRows}
        />
      )
    })

    expect(host.textContent).toContain('80 rows')
    expect(host.textContent).toMatch(/Showing \d+ of 80 stations/)
    expect(host.querySelectorAll('tbody tr').length).toBeLessThan(80)

    await act(async () => root.unmount())
    host.remove()
  })
})
