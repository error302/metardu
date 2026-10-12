import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import GNSSProcessor from './page'

jest.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

jest.mock('@/lib/i18n/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}))

describe('GNSS tool inputs', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('starts blank and requires real coordinate measurements before calculating', () => {
    act(() => root.render(<GNSSProcessor />))

    const height = container.querySelector<HTMLInputElement>('#ellipsoidal-height-m')
    expect(height?.value).toBe('')
    expect(container.textContent).toContain('No rover coordinates entered yet.')

    const calculate = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Calculate Baseline'))
    expect(calculate).toBeDefined()
    act(() => calculate?.click())

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Enter a base station name.')
    expect(container.textContent).not.toContain('Baseline Vector')
  })

  it('routes RINEX users to the real worker-backed baseline panel', () => {
    act(() => root.render(<GNSSProcessor />))

    const rinexTab = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('RINEX baseline processing'))
    expect(rinexTab).toBeDefined()
    act(() => rinexTab?.click())

    expect(container.querySelector('#gnss-baseline-title')?.textContent).toBe('Process a GNSS baseline')
    expect(container.querySelector('#gnss-base')).not.toBeNull()
    expect(container.querySelector('#gnss-rover')).not.toBeNull()
    expect(container.querySelector('#gnss-navigation')).not.toBeNull()
  })
})
