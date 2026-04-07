'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  id: string
  surveyType?: string
}

export default function ProjectTabs({ id, surveyType }: Props) {
  const pathname = usePathname()

  const isEngineering = surveyType?.startsWith('engineering')
  const isTopographic = surveyType === 'topographic' ||
                        surveyType === 'topographic_site' ||
                        surveyType === 'topographic_corridor'

  const tabs = [
    { label: 'Workspace', href: `/project/${id}` },
    ...(isTopographic ? [{ label: 'Topo', href: `/project/${id}/topo` }] : []),
    ...(isEngineering ? [{ label: 'Engineering', href: `/project/${id}/engineering` }] : []),
    { label: 'Submission', href: `/project/${id}/submission` },
    { label: 'Settings', href: `/project/${id}/settings` },
  ]

  return (
    <div className="border-b border-[var(--border-color)] bg-[var(--bg-card)]/80 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4">
        <nav aria-label="Project tabs" className="flex gap-2 overflow-x-auto py-3">
          {tabs.map((tab) => {
            const isActive =
              pathname === tab.href ||
              (tab.href !== `/project/${id}` && pathname.startsWith(`${tab.href}/`))

            return (
              <Link
                key={tab.href}
                href={tab.href}
                prefetch={false}
                className={[
                  'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                    : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-orange-500/40 hover:text-[var(--text-primary)]',
                ].join(' ')}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
