import ProjectDeedPlan from '@/components/deedplan/ProjectDeedPlan'
import DeedPlanGenerator from '@/components/deedplan/DeedPlanGenerator'
import MobileDesktopNotice from '@/components/MobileDesktopNotice'
import { ProfessionalDisclaimer } from '@/components/shared/ProfessionalDisclaimer'

interface DeedPlanPageProps {
  searchParams: Promise<{ project?: string }>
}

export default async function DeedPlanPage({ searchParams: searchParamsPromise }: DeedPlanPageProps) {
  const searchParams = await searchParamsPromise;
  const projectId = searchParams.project

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-7xl px-4 pt-4">
        <MobileDesktopNotice>
          A larger screen makes it easier to review bearings, distances, area and the draft plan before export.
        </MobileDesktopNotice>
      </div>
      <div className="mx-auto max-w-7xl px-4">
        <ProfessionalDisclaimer />
      </div>
      {projectId && projectId !== 'new' ? (
        <ProjectDeedPlan projectId={projectId} />
      ) : (
        <DeedPlanGenerator projectId="new" />
      )}
    </div>
  )
}
