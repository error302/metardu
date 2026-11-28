import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Compass, LandPlot, NotebookPen, Ruler } from 'lucide-react'

export const metadata: Metadata = { title: 'Field tools | METARDU' }

const tools = [
  { href: '/tools/distance', label: 'Distance and bearing', detail: 'Calculate a grid distance and bearing from two coordinates.', icon: Compass },
  { href: '/tools/area', label: 'Area', detail: 'Check the area of a closed coordinate list.', icon: LandPlot },
  { href: '/tools/level-book', label: 'Level book', detail: 'Enter backsight, intermediate and foresight readings.', icon: NotebookPen },
  { href: '/tools/two-peg-test', label: 'Two-peg test', detail: 'Check level collimation from staff readings.', icon: Ruler },
]

export default function FieldToolsPage() {
  return (
    <section className="mx-auto max-w-xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Field tools</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Quick checks for use on site.</p>
      <ul className="mt-5 divide-y divide-[var(--border-color)] rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        {tools.map(({ href, label, detail, icon: Icon }) => (
          <li key={href}>
            <Link href={href} prefetch={false} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-[var(--bg-secondary)]">
              <Icon size={20} className="shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">{label}</h2>
                <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">{detail}</p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
