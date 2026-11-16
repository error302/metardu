import {
  LEGACY_DISPLAY_MODE_KEY,
  applyDisplayModeDom,
  isDisplayMode,
  readLegacyDisplayMode,
} from '@/lib/ui/displayMode'

describe('displayMode', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('field-mode')
  })

  it('accepts only the two supported modes', () => {
    expect(isDisplayMode('dark')).toBe(true)
    expect(isDisplayMode('field')).toBe(true)
    expect(isDisplayMode('light')).toBe(false)
    expect(isDisplayMode(undefined)).toBe(false)
  })

  it('reads the legacy key written by the previous toggle', () => {
    window.localStorage.setItem(LEGACY_DISPLAY_MODE_KEY, 'field')
    expect(readLegacyDisplayMode()).toBe('field')
  })

  it('ignores unknown legacy values', () => {
    window.localStorage.setItem(LEGACY_DISPLAY_MODE_KEY, 'light')
    expect(readLegacyDisplayMode()).toBeNull()
  })

  it('writes the attribute CSS keys off and keeps the legacy class in step', () => {
    applyDisplayModeDom('field')
    expect(document.documentElement.getAttribute('data-theme')).toBe('field')
    expect(document.documentElement.classList.contains('field-mode')).toBe(true)

    applyDisplayModeDom('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('field-mode')).toBe(false)
  })
})
