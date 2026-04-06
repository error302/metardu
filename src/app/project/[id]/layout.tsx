import type { ReactNode } from 'react'
import ProjectTabs from '@/components/project/ProjectTabs'

interface Props {
  children: ReactNode
  params: { id: string }
}

export default function ProjectLayout({ children, params }: Props) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <ProjectTabs id={params.id} />
      {children}
    </div>
  )
}
