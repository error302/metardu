'use client'
import { DepthSounderPanel } from '@/components/hydrographic/DepthSounderPanel'
import { PageHeader } from '@/components/shared/PageHeader'

export default function DepthSounderPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <PageHeader title="Depth Sounder" subtitle="Live echo sounder connection + bathymetric tracking" reference="NMEA 0183 | $SDDPT / $SDDBT | Web Serial API" />
      <div className="mt-6"><DepthSounderPanel /></div>
    </div>
  )
}
