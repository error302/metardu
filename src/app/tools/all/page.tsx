'use client'

import { ProcessingToolbox } from '@/components/tools/ProcessingToolbox'
import { PageHeader } from '@/components/shared/PageHeader'

export default function AllToolsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <PageHeader
        title="Processing Toolbox"
        subtitle="Search and launch any of METARDU's 60+ survey tools"
        reference="QGIS Processing Toolbox-inspired"
      />
      <div className="mt-6">
        <ProcessingToolbox />
      </div>
    </div>
  )
}
