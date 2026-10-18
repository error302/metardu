'use client'
import {useState,type ReactNode} from 'react'
import Link from 'next/link'
import {ChevronDown,ChevronUp} from 'lucide-react'
import NavBar from '@/components/NavBar'

export function isCadWorkspaceRoute(pathname:string) {
  return pathname==='/tools/cad-editor'||/^\/project\/[^/]+\/cad-editor\/?$/.test(pathname)
}
/** A stable main element keeps the current document mounted while chrome changes. */
export function CadWorkspaceShell({children}:{children:ReactNode}) {
  const [navigationOpen,setNavigationOpen]=useState(false)
  return <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[var(--bg-primary)] pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] text-[var(--text-primary)] md:pb-0">
    <header className="z-40 shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-primary)] pt-[env(safe-area-inset-top,0px)]">
      <div className="flex min-h-11 items-center justify-between gap-3 px-3 sm:px-5"><Link href="/tools" className="inline-flex min-h-11 items-center gap-3 font-display text-sm tracking-wide"><span>METARDU</span><span className="border-l border-[var(--border-color)] pl-3 font-mono text-[10px] text-[var(--text-secondary)]">DRAFTING</span></Link><button type="button" aria-controls="cad-site-navigation" aria-expanded={navigationOpen} onClick={()=>setNavigationOpen(open=>!open)} className="inline-flex min-h-11 items-center gap-2 text-xs text-[var(--text-secondary)]">{navigationOpen?'Hide site navigation':'Show site navigation'}{navigationOpen?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}</button></div>
      {navigationOpen&&<div id="cad-site-navigation"><NavBar/></div>}
    </header>
    <main id="main-content" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
  </div>
}
