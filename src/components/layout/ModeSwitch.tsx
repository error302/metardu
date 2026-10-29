'use client'
import Link from 'next/link'
import { House,LayoutDashboard } from 'lucide-react'
export function ModeSwitch({target,authenticated=false}:{target:'website'|'workspace';authenticated?:boolean}) {
  const workspace=target==='workspace'
  const Icon=workspace?LayoutDashboard:House
  return <Link href={workspace?'/dashboard':'/'} prefetch={workspace?authenticated:true}
    aria-label={workspace?'Open dashboard':'Open METARDU website'}
    className={'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)] sm:text-sm '+(workspace?'border-[var(--accent)] bg-[var(--accent)] text-black hover:bg-[var(--accent-dim)]':'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]')}>
    <Icon aria-hidden="true" className="h-4 w-4"/><span>{workspace?'Dashboard':'Website'}</span>
  </Link>
}
