import { fireEvent, render, screen } from '@testing-library/react'
import { CrsPicker } from '../CrsPicker'
import { isRegistered, listSupportedCrs } from '@/lib/spatial/projectCrs'
import { horizontalCrsFor } from '@/lib/spatial/projectReferenceSystem'

// CRS codes are derived from the registry/declaration authority — never
// hardcoded zone literals (T1.5).
const ARC_1960_37S = horizontalCrsFor('ARC1960', 37, 'S')
const ARC_1960_36S = horizontalCrsFor('ARC1960', 36, 'S')

/** The picker is the single CRS entry point: selection, never typing. */
describe('CrsPicker', () => {
  it('offers only registered projected CRSs and excludes display-only Web Mercator', () => {
    render(
      <CrsPicker id="crs" label="Survey CRS" value="" onChange={jest.fn()} />,
    )
    const select = screen.getByRole('combobox', { name: 'Survey CRS' }) as HTMLSelectElement
    const codes = Array.from(select.options).map((option) => option.value).filter(Boolean)
    expect(codes.length).toBeGreaterThanOrEqual(100)
    for (const code of codes) {
      expect(isRegistered(code)).toBe(true)
      expect(code).not.toBe('EPSG:3857')
    }
    // Full registry minus geographic + display-only, nothing invented.
    const expected = listSupportedCrs().filter((info) => info.projected && !info.displayOnly)
    expect(codes).toHaveLength(expected.length)
  })

  it('describes the selected CRS with datum, units and transformation notes', () => {
    render(
      <CrsPicker id="crs" label="Survey CRS" value={ARC_1960_37S} onChange={jest.fn()} />,
    )
    const summary = screen.getByTestId('crs-summary')
    expect(summary.textContent).toContain(ARC_1960_37S)
    expect(summary.textContent).toContain('datum Arc 1960')
    expect(summary.textContent).toContain('metres')
    expect(summary.textContent).toMatch(/EPSG:1122/)
  })

  it('changes the CRS only through the select', () => {
    const onChange = jest.fn()
    render(
      <CrsPicker id="crs" label="Survey CRS" value="" onChange={onChange} />,
    )
    const filter = screen.getByRole('searchbox', { name: /Filter Survey CRS/ }) as HTMLInputElement
    fireEvent.change(filter, { target: { value: 'Arc 1960' } })
    expect(onChange).not.toHaveBeenCalled()

    const select = screen.getByRole('combobox', { name: 'Survey CRS' }) as HTMLSelectElement
    expect(Array.from(select.options).every((option) =>
      option.value === '' || /Arc 1960/.test(option.text))).toBe(true)
    fireEvent.change(select, { target: { value: ARC_1960_36S } })
    expect(onChange).toHaveBeenCalledWith(ARC_1960_36S)
  })

  it('reports a held unregistered code instead of silently accepting it', () => {
    render(
      <CrsPicker id="crs" label="Survey CRS" value="EPSG:99999" onChange={jest.fn()} />,
    )
    expect(screen.getByRole('alert').textContent).toMatch(/not in the CRS registry/)
  })

  it('hides geographic degree CRSs unless allowed', () => {
    render(
      <CrsPicker id="crs" label="Survey CRS" value="" onChange={jest.fn()} />,
    )
    const projectedOnly = screen.getByRole('combobox', { name: 'Survey CRS' }) as HTMLSelectElement
    expect(Array.from(projectedOnly.options).some((option) => option.value === 'EPSG:4326')).toBe(false)

    render(
      <CrsPicker id="geo" label="Source CRS" value="" onChange={jest.fn()} allowGeographic />,
    )
    const withGeo = screen.getByRole('combobox', { name: 'Source CRS' }) as HTMLSelectElement
    expect(Array.from(withGeo.options).some((option) => option.value === 'EPSG:4326')).toBe(true)
  })

  it('labels an auto-applied value with its provenance and the override path', () => {
    render(
      <CrsPicker
        id="crs" label="Survey CRS" value={ARC_1960_37S} onChange={jest.fn()}
        provenance="from the project's declared reference system"
      />,
    )
    const provenance = screen.getByTestId('crs-provenance').textContent ?? ''
    expect(provenance).toMatch(/Auto-applied from the project/)
    expect(provenance).toMatch(/Change it here/)
  })

  it('hides provenance when nothing is selected yet', () => {
    render(
      <CrsPicker
        id="crs" label="Survey CRS" value="" onChange={jest.fn()}
        provenance="from the project's declared reference system"
      />,
    )
    expect(screen.queryByTestId('crs-provenance')).toBeNull()
  })
})
