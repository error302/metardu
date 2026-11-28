'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, CalendarDays, ChevronRight, Crosshair, MapPin, MapPinned, MoreHorizontal, Radar, Store, Target, Wrench } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { isNavItemActive, PHONE_DOCK_LINKS, PHONE_MORE_LINKS } from '@/lib/navigation-shell'

const icons = {
  '/field/collect': Crosshair,
  '/field/setout': Target,
  '/map': MapPinned,
  '/schedule': CalendarDays,
  '/fieldbook': BookOpen,
  '/equipment': Radar,
  '/marketplace': Store,
  '/beacons': MapPin,
  '/field/tools': Wrench,
}

const dockItem = 'flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium leading-none'

export default function MobileNav() {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)
  const moreActive = PHONE_MORE_LINKS.some(item => isNavItemActive(pathname, item.href))

  useEffect(() => { setShowMore(false) }, [pathname])
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)')
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setShowMore(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="fixed left-1/2 z-50 flex w-[min(26rem,calc(100%-1rem))] -translate-x-1/2 items-center gap-1 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-1.5 shadow-lg md:hidden"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
    >
      {PHONE_DOCK_LINKS.map(({ href, label }) => {
        const Icon = icons[href]
        const active = isNavItemActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={active ? 'page' : undefined}
            className={dockItem + (active ? ' bg-[var(--accent-subtle)] text-[var(--accent)]' : ' text-[var(--text-secondary)]')}
          >
            <Icon size={20} aria-hidden="true" />
            <span className="truncate">{label}</span>
          </Link>
        )
      })}
      <Sheet open={showMore} onOpenChange={setShowMore}>
        <SheetTrigger asChild>
          <button
            type="button"
            className={dockItem + (moreActive ? ' bg-[var(--accent-subtle)] text-[var(--accent)]' : ' text-[var(--text-secondary)]')}
          >
            <MoreHorizontal size={20} aria-hidden="true" />
            More
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" aria-describedby={undefined} className="z-[60] mx-auto max-h-[75dvh] max-w-lg gap-2 overflow-y-auto rounded-t-2xl border-[var(--border-color)] bg-[var(--bg-primary)] px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
          <SheetTitle className="pr-10 text-base text-[var(--text-primary)]">More</SheetTitle>
          <ul className="divide-y divide-[var(--border-color)]">
            {PHONE_MORE_LINKS.map(({ href, label }) => {
              const Icon = icons[href]
              const active = isNavItemActive(pathname, href)
              return (
                <li key={href}>
                  <Link
                    href={href}
                    prefetch={false}
                    onClick={() => setShowMore(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-12 items-center gap-3 rounded-lg px-2 text-sm font-medium ${active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}
                  >
                    <Icon size={19} className="text-[var(--accent)]" aria-hidden="true" />
                    <span className="flex-1">{label}</span>
                    <ChevronRight size={16} className="text-[var(--text-muted)]" aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </nav>
  )
}
