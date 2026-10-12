'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { STAGES, stageHref } from '@/lib/workspaces/stageRegistry'

interface Props {
  id: string
  surveyType?: string
}

export default function ProjectTabs({ id, surveyType }: Props) {
  const pathname = usePathname()
  const baseHref = `/project/${id}`
  const isEngineering = surveyType?.startsWith('engineering')
  const isTopographic = surveyType === 'topographic' ||
    surveyType === 'topographic_site' ||
    surveyType === 'topographic_corridor'

  const tools = [
    { label: 'Classic workflow', href: `${baseHref}/workspace` },
    { label: 'Survey map', href: `${baseHref}/map` },
    ...(isTopographic ? [{ label: 'Topographic', href: `${baseHref}/topo` }] : []),
    ...(isEngineering ? [{ label: 'Engineering', href: `${baseHref}/engineering` }] : []),
    { label: 'Documents', href: `${baseHref}/documents` },
    { label: 'Submission', href: `${baseHref}/submission` },
  ]

  return (
    <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex items-center justify-between gap-4 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Project workflow</p>
          <Link href={`${baseHref}/settings`} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">Project settings</Link>
        </div>
        <nav aria-label="Project stages" className="mt-2 flex gap-1 overflow-x-auto scrollbar-none">
          {STAGES.map((stage, index) => {
            const href = stageHref(id, stage)
            const active = pathname === href
            return (
              <Link
                key={stage.id}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`group flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] ${active
                  ? 'border-[var(--accent)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:border-[var(--border-color)] hover:text-[var(--text-primary)]'}`}
              >
                <span className="font-mono text-[10px] text-[var(--text-muted)]">{String(index + 1).padStart(2, '0')}</span>
                {stage.label}
              </Link>
            )
          })}
        </nav>
        <nav aria-label="Project tools" className="flex gap-1 overflow-x-auto border-t border-[var(--border-color)] py-2 scrollbar-none">
          {tools.map((tool) => {
            const active = pathname === tool.href
            return (
              <Link
                key={tool.href}
                href={tool.href}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                className={`shrink-0 rounded px-3 py-1.5 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${active
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'}`}
              >
                {tool.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
