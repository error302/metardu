import Link from 'next/link'

type UpgradeType = 'projects' | 'dxf' | 'share' | 'team'

export default function UpgradePrompt({ type }: { type: UpgradeType }) {
  const messages: Record<UpgradeType, { title: string; desc: string }> = {
    projects: {
      title: 'Upgrade to Pro',
      desc: 'Free plan includes 1 project. Upgrade to Pro for unlimited projects.',
    },
    dxf: {
      title: 'Upgrade to Pro',
      desc: 'DXF export is available on Pro plans and above.',
    },
    share: {
      title: 'Upgrade to Pro',
      desc: 'Share links are available on Pro plans and above.',
    },
    team: {
      title: 'Upgrade to Team',
      desc: 'Team collaboration is available on Team plans.',
    },
  }

  const { title, desc } = messages[type]

  return (
    <div className="bg-amber-900/20 border border-amber-500 rounded-xl p-6 text-center mb-6">
      <p className="text-amber-500 text-lg font-bold mb-2">{title}</p>
      <p className="text-[var(--text-primary)] mb-4">{desc}</p>
      <div className="flex gap-3 justify-center">
        <Link
          href="/pricing"
          className="bg-amber-500 text-black px-6 py-2 rounded font-bold hover:bg-amber-400"
        >
          View Plans
        </Link>
        <span className="text-[var(--text-secondary)] text-sm self-center">
          From KES 500/month
        </span>
      </div>
    </div>
  )
}
