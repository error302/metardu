'use client';

import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import CrossSectionInput from '@/components/earthworks/CrossSectionInput'
import ProjectCrossSections from '@/components/earthworks/ProjectCrossSections'
import { RDM_DETAIL_TOLERANCES } from '@/lib/standards/rdm11'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function CrossSectionsPage() {
  const { t } = useLanguage()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project')

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('tools.crossSections')}
        subtitle={t('tools.crossSectionsDesc')}
      />
      <div className="mb-6 card">
        <div className="card-header">
          <span className="label">RDM 1.1 Table 5.2 Detail Pickup Tolerances</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table min-w-[680px]">
            <thead>
              <tr>
                <th>Feature Class</th>
                <th>XY</th>
                <th>Z</th>
                <th>Use in Cross Sections</th>
              </tr>
            </thead>
            <tbody>
              {RDM_DETAIL_TOLERANCES.map(t => (
                <tr key={t.feature}>
                  <td className="font-medium">{t.feature}</td>
                  <td className="font-mono">{t.xy}</td>
                  <td className="font-mono">{t.z}</td>
                  <td className="text-sm text-[var(--text-muted)]">{t.fieldUse}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {projectId && projectId !== 'new' ? (
        <ProjectCrossSections projectId={projectId} />
      ) : (
        <CrossSectionInput />
      )}
    </div>
  )
}
