'use client'
import { BeaconRegistryPanel } from '@/components/beacons/BeaconRegistryPanel'
import { PublicControlCatalog } from '@/components/beacons/PublicControlCatalog'
export default function BeaconsPage() {
  return <div className="max-w-7xl mx-auto px-4 py-8 space-y-10"><PublicControlCatalog /><section aria-label="Project beacon observations"><BeaconRegistryPanel /></section></div>
}
