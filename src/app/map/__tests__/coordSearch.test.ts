import type Map from 'ol/Map'
import { fromLonLat } from 'ol/proj'
import { handleCoordSearch } from '../utils/coordSearch'

describe('map coordinate search navigation', () => {
  function fixture() {
    const animate = jest.fn()
    return { animate, ref: { current: { getView: () => ({ animate }) } as unknown as Map }, message: jest.fn() }
  }
  it.each([
    ['-1.286389, 36.817223', -1.286389, 36.817223],
    ['0 37', 0, 37],
    ['51.5, -0.1', 51.5, -0.1],
  ])('navigates documented latitude, longitude without guessing a swap: %s', async (input, lat, lon) => {
    const { ref, animate } = fixture()
    await handleCoordSearch(String(input), ref, null)
    expect(animate).toHaveBeenCalledWith(expect.objectContaining({ center: fromLonLat([Number(lon), Number(lat)]) }))
  })
  it.each(['95, 5', '1, 200', 'garbage -1 37', '-1 37 12', 'Infinity, 37', 'NaN, 37'])('rejects invalid or ambiguous input: %s', async input => {
    const { ref, animate, message } = fixture()
    await handleCoordSearch(input, ref, null, message)
    expect(animate).not.toHaveBeenCalled()
    expect(message).toHaveBeenCalled()
  })
})
