import { RouteLoading } from '@/components/shared/RouteLoading'

/**
 * Map route loading — MapClient + OpenLayers are the heaviest chunk graph in
 * the app, so this screen shows longest. Instrument panel is full-height with
 * survey-specific boot lines; no skeleton beneath (the map fills the viewport).
 */
export default function MapLoading() {
  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100dvh-4rem)] w-full flex items-center justify-center bg-[var(--bg-secondary)]">
      <RouteLoading
        label="Loading map"
        height={340}
        lines={[
          'Preparing project coordinate systems…',
          'Loading basemap tiles…',
          'Initialising survey layers…',
          'Preparing parcels & beacons…',
        ]}
      />
    </div>
  )
}
