import {
  createWebGLPointsFromCoords,
  updateWebGLPointsStyle,
} from '../webglPointsLayer'
import { parseLiteralStyle } from 'ol/render/webgl/style'

describe('optional WebGL survey point layer', () => {
  it('builds the layer from project-grid coordinates and updates only supplied style variables', () => {
    const layer = createWebGLPointsFromCoords([
      { easting: 500_000, northing: 9_800_000, elevation: 12.5 },
      { easting: 500_010, northing: 9_800_020, elevation: 18.25 },
    ])
    const setStyle = jest.spyOn(layer, 'setStyle')

    expect(layer.getSource()?.getFeatures()).toHaveLength(2)
    updateWebGLPointsStyle(layer, { minElevation: 10, maxElevation: 20, pointRadius: 6 })

    const style = setStyle.mock.calls[0][0]
    expect(style).toMatchObject({ 'circle-radius': 6, 'circle-opacity': 0.8 })
    expect(() => parseLiteralStyle(style as import('ol/style/flat').FlatStyle)).not.toThrow()
  })

  it('does nothing when no style variables are provided', () => {
    const layer = createWebGLPointsFromCoords([])
    const setStyle = jest.spyOn(layer, 'setStyle')

    updateWebGLPointsStyle(layer, {})

    expect(setStyle).not.toHaveBeenCalled()
  })
})
