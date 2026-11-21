import { render, screen } from '@testing-library/react'
import { SettingsTab } from '../SettingsTab'
import type { Bounds, VolumeResult } from '../types'
import type { ContourLine, TINSurface } from '@/lib/engine/contours'
import { horizontalCrsFor } from '@/lib/spatial/projectReferenceSystem'

// CRS codes derive from the declaration authority — never hardcoded literals.
const ARC_1960_37S = horizontalCrsFor('ARC1960', 37, 'S')

/**
 * Slice 4: the contour interval is checked against the DECLARED source
 * vertical accuracy (never an invented default), and the CRS is selected
 * from the registry, never typed.
 */

function renderSettings(overrides: { contourInterval?: number; sourceVerticalRmseText?: string } = {}) {
  const noop = () => {}
  const bounds: Bounds = { minE: 0, maxE: 10, minN: 0, maxN: 10, minZ: 100, maxZ: 120 }
  return render(
    <SettingsTab
      contourInterval={overrides.contourInterval ?? 0.25}
      setContourInterval={noop}
      indexMultiplier={5}
      setIndexMultiplier={noop}
      mapTitle="Test plan"
      setMapTitle={noop}
      horizontalCrs={ARC_1960_37S}
      setHorizontalCrs={noop}
      verticalDatum="Site benchmark"
      setVerticalDatum={noop}
      sourceVerticalRmseText={overrides.sourceVerticalRmseText ?? ''}
      setSourceVerticalRmseText={noop}
      heightsInMetres
      setHeightsInMetres={noop}
      points={{ length: 100 }}
      bounds={bounds}
      isGenerating={false}
      generateError=""
      handleGenerate={noop}
      contours={[] as ContourLine[]}
      tinSurface={null as unknown as TINSurface}
      volumeResult={null as unknown as VolumeResult}
    />,
  )
}

describe('contour interval accuracy guidance', () => {
  it('warns when the chosen interval is finer than the declared source accuracy supports', () => {
    renderSettings({ contourInterval: 0.25, sourceVerticalRmseText: '0.10' })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/0\.25 m is finer than the 0\.329 m guideline/)
    expect(alert.textContent).toMatch(/ASPRS Ed\. 2 Table B\.6/)
    expect(alert.textContent).toMatch(/guidance, not a legal limit/)
  })

  it('states the guideline without warning when the interval is conservative', () => {
    renderSettings({ contourInterval: 0.5, sourceVerticalRmseText: '0.10' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/Guideline interval for the declared source accuracy: 0\.329 m/)).toBeTruthy()
  })

  it('asks for the declaration instead of inventing an accuracy when none exists', () => {
    renderSettings({ sourceVerticalRmseText: '' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/Declare the source vertical RMSE to check the contour interval/)).toBeTruthy()
  })

  it('selects the horizontal CRS from the registry and declares the RMSE separately', () => {
    renderSettings()
    expect(screen.getByRole('combobox', { name: 'Horizontal CRS (survey plane)' })).toBeTruthy()
    // The old free-text EPSG input is gone: no element carries its bare id.
    expect(document.getElementById('contour-horizontal-crs')).toBeNull()
    expect(screen.getByLabelText('Source vertical RMSE in metres')).toBeTruthy()
    expect(screen.getByTestId('contour-horizontal-crs-summary').textContent).toMatch(/datum Arc 1960/)
  })
})
