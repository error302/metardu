'use client'
import { useMemo } from 'react'
import RoadWorkbenchEditor from './RoadWorkbenchEditor'
import { roadWorkbenchExample } from '@/lib/engineering/roadWorkbenchExample'
export default function RoadWorkbenchExample() {
  const example = useMemo(() => roadWorkbenchExample(), [])
  return (
    <div className="space-y-4">
      <p className="border-l-2 border-amber-500/60 pl-3 text-sm text-[var(--text-secondary)]">
        Synthetic worked example. Explore the connected views with sample
        alignment, profile and section inputs. These values do not represent a
        real site, field survey or approved design.
      </p>
      <RoadWorkbenchEditor road={example.road} reference={example.reference} />
    </div>
  )
}
