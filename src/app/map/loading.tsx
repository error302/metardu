import { FullPageLoading } from '@/components/shared/LoadingState'

/**
 * Map route loading — MapClient + OpenLayers are the heaviest chunk graph in
 * the app, so this screen shows longest. Full-viewport brand screen below
 * the app bar; the map itself fills the viewport once initialised.
 */
export default function MapLoading() {
  return <FullPageLoading message="Loading map" />
}
