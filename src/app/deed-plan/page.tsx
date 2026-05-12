import DeedPlanGenerator from '@/components/deedplan/DeedPlanGenerator'
import MobileDesktopNotice from '@/components/MobileDesktopNotice'

export default function DeedPlanPage() {
  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-7xl px-4 pt-4">
        <MobileDesktopNotice>
          Deed plan drafting needs enough screen width to inspect bearings, distances, area, and the final plan before download. Use mobile for quick review, then finish official output on desktop.
        </MobileDesktopNotice>
      </div>
      <DeedPlanGenerator projectId="new" />
    </div>
  )
}
