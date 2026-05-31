import MutationPlanGenerator from '@/components/mutationplan/MutationPlanGenerator'
import { MapPinned } from 'lucide-react'

export default function MutationPlanPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-amber-500/10 rounded-lg">
          <MapPinned className="h-6 w-6 text-amber-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Mutation Survey Plan (Form No. 3)</h1>
          <p className="text-sm text-zinc-400">
            Kenya Survey Regulations 1994 — Subdivision scheme plan for Director of Surveys submission
          </p>
        </div>
      </div>
      <MutationPlanGenerator />
    </div>
  )
}
