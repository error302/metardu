import Link from 'next/link'

export default function QuickStartPage() {
  const steps = [
    {
      number: '1',
      title: 'Open your workspace',
      desc: 'Open Dashboard and sign in, or create an account. Your dashboard is the starting point for projects, field records and deliverables.',
      href: '/dashboard', linkLabel: 'Open Dashboard',
    },
    {
      number: '2',
      title: 'Create and reference the project',
      desc: 'Choose the survey type and record the job scope. In Project Settings, declare the reference system, height basis and grid or ground distance basis supported by your control.',
      href: '/project/new', linkLabel: 'Create a project',
    },
    {
      number: '3',
      title: 'Bring in observations and survey points',
      desc: 'Use Field Book with a supported instrument, enter observations manually, or import an existing field file. Confirm source units and CRS, retain the original records, and keep missing heights unknown.',
      href: '/import', linkLabel: 'Open data import',
    },
    {
      number: '4',
      title: 'Compute and review the survey',
      desc: 'Open the project stages to review control and observations, then run the supported computation for your job. Topographic terrain, traverses and other survey types need their own inputs and checks.',
      href: '/projects', linkLabel: 'Choose a project',
    },
    {
      number: '5',
      title: 'Prepare and check deliverables',
      desc: 'Use the project Deliver stage for available drawings, schedules and reports. Review the saved revision, reference system and evidence, then check the output in the receiving application before professional issue.',
      href: '/reports', linkLabel: 'Open documents',
    },
  ]

  return (
    <div className="min-h-screen py-16">
      <div className="max-w-4xl mx-auto px-6">
        <Link href="/docs" className="text-[var(--accent)] hover:underline mb-8 inline-block">
          ← Back to Documentation
        </Link>

        <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-8">Quick Start Guide</h1>

        <div className="space-y-8">
          {steps.map((step) => (
            <div key={step.number} id={`step-${step.number}`} className="flex scroll-mt-24 gap-6">
              <div className="flex-shrink-0 w-12 h-12 bg-[var(--accent)] rounded-full flex items-center justify-center text-black font-bold text-xl">
                {step.number}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{step.title}</h2>
                <p className="text-[var(--text-secondary)]">{step.desc}</p>
                <Link href={step.href} className="mt-3 inline-flex text-sm font-medium text-[var(--accent)] hover:underline">{step.linkLabel}</Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Continue project review</h3>
          <p className="text-[var(--text-secondary)] mb-4">
            Keep source observations, computations, review notes and output revisions together. A generated file does not establish field verification or professional approval.
          </p>
          <Link
            href="/dashboard"
            className="inline-block px-6 py-3 bg-[var(--accent)] text-black font-semibold rounded-lg hover:bg-[var(--accent-dim)]"
          >
            Go to Dashboard →
          </Link>
        </div>

        <div className="mt-12">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-6">Next Steps</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Link
              href="/docs/csv-import"
              className="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] hover:border-[var(--accent)] transition-colors"
            >
              <h4 className="text-[var(--text-primary)] font-semibold mb-1">Learn CSV Import</h4>
              <p className="text-[var(--text-secondary)] text-sm">Import your field notes automatically</p>
            </Link>
            <Link
              href="/guide"
              className="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] hover:border-[var(--accent)] transition-colors"
            >
              <h4 className="text-[var(--text-primary)] font-semibold mb-1">Field Guide</h4>
              <p className="text-[var(--text-secondary)] text-sm">Step-by-step survey workflows</p>
            </Link>
            <Link
              href="/tools/leveling"
              className="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] hover:border-[var(--accent)] transition-colors"
            >
              <h4 className="text-[var(--text-primary)] font-semibold mb-1">Leveling Calculator</h4>
              <p className="text-[var(--text-secondary)] text-sm">Calculate elevations with arithmetic checks</p>
            </Link>
            <Link
              href="/community"
              className="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] hover:border-[var(--accent)] transition-colors"
            >
              <h4 className="text-[var(--text-primary)] font-semibold mb-1">Join Community</h4>
              <p className="text-[var(--text-secondary)] text-sm">Connect with other surveyors</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
