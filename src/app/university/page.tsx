import Link from 'next/link'
import { ArrowUpRight, BookOpen, Compass, FileCheck2, Map, Ruler, Waves } from 'lucide-react'

const pathways = [
  {
    number: '01',
    title: 'Set up trustworthy control',
    description: 'Establish project units and coordinate reference, check control provenance, and understand what a coordinate conversion does and does not prove.',
    icon: Compass,
    resources: [
      { label: 'METARDU quick start', href: '/docs/quick-start', kind: 'Guide' },
      { label: 'Coordinate systems and projections', href: '/tools/coordinates', kind: 'Tool' },
      { label: 'Scale factor', href: '/tools/scale-factor', kind: 'Tool' },
    ],
  },
  {
    number: '02',
    title: 'Record and reduce field observations',
    description: 'Keep field readings, station context, and reductions together; review arithmetic and closure before using results in design or setting out.',
    icon: Ruler,
    resources: [
      { label: 'Traverse field book', href: '/docs/traverse-field-book', kind: 'Guide' },
      { label: 'Level book', href: '/docs/level-book', kind: 'Guide' },
      { label: 'Traverse adjustment', href: '/tools/traverse', kind: 'Tool' },
      { label: 'Levelling and height of collimation', href: '/tools/leveling', kind: 'Tool' },
    ],
  },
  {
    number: '03',
    title: 'Prepare and review a boundary plan',
    description: 'Move from source observations to a draft plan while keeping the surveyor’s independent review, current authority requirements, and approval status explicit.',
    icon: Map,
    resources: [
      { label: 'Create your first plan', href: '/docs/first-plan', kind: 'Guide' },
      { label: 'Survey regulations', href: '/tools/survey-regulations', kind: 'Reference' },
      { label: 'Mutation plan workspace', href: '/tools/mutation-plan', kind: 'Tool' },
    ],
  },
  {
    number: '04',
    title: 'Set out and verify drainage',
    description: 'Prepare an ordered manhole run, review design inverts and pipe crown levels, then take the schedule to the field for independent control and cover checks.',
    icon: Waves,
    resources: [
      { label: 'Road and corridor design', href: '/tools/road-design', kind: 'Tool' },
      { label: 'Pipe network calculator', href: '/tools/pipe-network', kind: 'Tool' },
      { label: 'Pipe gradient', href: '/tools/pipe-gradient', kind: 'Tool' },
      { label: 'Setting-out tables', href: '/tools/staking-table', kind: 'Tool' },
    ],
  },
  {
    number: '05',
    title: 'Deliver reviewable records',
    description: 'Check the declared reference system, source data, limitations, and review state on exported schedules and reports before sharing them.',
    icon: FileCheck2,
    resources: [
      { label: 'Survey report builder', href: '/tools/survey-report-builder', kind: 'Tool' },
      { label: 'Manuals and references', href: '/docs/manuals', kind: 'Reference' },
      { label: 'All survey tools', href: '/tools', kind: 'Index' },
    ],
  },
]

export default function UniversityPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <header className="max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-[.2em] text-[var(--accent)]">METARDU learning</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-5xl">Learn the workflow.<br /><span className="text-[var(--accent)]">Use the tools with care.</span></h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">A practical index of the guides, references, and working tools already available in METARDU. These materials support professional practice; they do not award qualifications or replace a licensed surveyor’s judgement.</p>
        <Link href="/docs/quick-start" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--accent)] px-5 font-semibold text-black transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
          Start with the quick guide <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </header>

      <section aria-labelledby="pathways-heading" className="mt-16">
        <div className="mb-6 flex items-end justify-between gap-4 border-b border-[var(--border-color)] pb-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[.18em] text-[var(--text-muted)]">Field to deliverable</p>
            <h2 id="pathways-heading" className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Survey learning pathways</h2>
          </div>
          <BookOpen className="hidden h-7 w-7 text-[var(--accent)] sm:block" aria-hidden="true" />
        </div>
        <ol className="grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
          {pathways.map(pathway => {
            const Icon = pathway.icon
            return (
              <li key={pathway.number} className="flex min-w-0 flex-col rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs tracking-widest text-[var(--text-muted)]">PATHWAY {pathway.number}</span>
                  <Icon className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-[var(--text-primary)]">{pathway.title}</h3>
                <p className="mt-2 min-h-20 text-sm leading-6 text-[var(--text-secondary)]">{pathway.description}</p>
                <ul className="mt-5 space-y-2 border-t border-[var(--border-color)] pt-4">
                  {pathway.resources.map(resource => (
                    <li key={resource.href}>
                      <Link href={resource.href} className="group flex min-h-10 items-center justify-between gap-3 rounded px-2 text-sm text-[var(--text-primary)] transition hover:bg-[var(--bg-tertiary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                        <span>{resource.label}</span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--text-muted)]">{resource.kind}<ArrowUpRight size={14} className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ol>
      </section>
    </main>
  )
}
