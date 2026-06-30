'use client'

import { ReportTemplateEditor } from '@/components/report-editor/ReportTemplateEditor'
import { PageHeader } from '@/components/shared/PageHeader'

export default function ReportTemplatesPage() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <PageHeader
        title="Report Template Editor"
        subtitle="Design custom document layouts — drag & drop elements onto paper"
        reference="QGIS Print Composer-inspired | SoK Compliant"
      />
      <div className="mt-6 h-[calc(100vh-200px)]">
        <ReportTemplateEditor />
      </div>
    </div>
  )
}
