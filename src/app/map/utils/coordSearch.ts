import type { MutableRefObject } from 'react'

/**
 * Navigates the map to coordinates parsed from a search string.
 *
 * Accepts two formats:
 *  - Lat/Lon (e.g. "-1.0, 37.0" or "-1.0 37.0")
 *  - UTM Easting/Northing in EPSG:21037 (large numbers, e.g. "500000 9800000")
 *
 * Note: The caller is responsible for clearing the search input after
 * this resolves, since the setter lives in component state.
 */
export async function handleCoordSearch(
  searchInput: string,
  mapInstance: MutableRefObject<any>,
): Promise<void> {
  if (!mapInstance.current || !searchInput.trim()) return

  const parts = searchInput.trim().split(/[,\s]+/).map(Number).filter(n => !isNaN(n))

  if (parts.length >= 2) {
    let lon = parts[1]
    let lat = parts[0]

    // If values look like Eastings/Northings (large numbers), treat differently
    if (Math.abs(parts[0]) > 100 && Math.abs(parts[1]) > 100) {
      // Likely UTM coordinates - try to transform from EPSG:21037
      try {
        const { transform } = await import('ol/proj')
        const [x, y] = transform([parts[0], parts[1]], 'EPSG:21037', 'EPSG:3857')
        mapInstance.current.getView().animate({ center: [x, y], zoom: 16, duration: 600 })
      } catch { /* fallback */ }
    } else {
      if (lon > lat) { [lon, lat] = [lat, lon] } // common swap
      const { fromLonLat } = await import('ol/proj')
      const center = fromLonLat([lon, lat])
      mapInstance.current.getView().animate({ center, zoom: 16, duration: 600 })
    }
  }
}
