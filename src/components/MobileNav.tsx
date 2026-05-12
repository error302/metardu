'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FolderKanban, LayoutDashboard, MapPinned, UserRound, UsersRound, Wrench } from 'lucide-react'
import { createClient } from '@/lib/api-client/client'
import { isNavItemActive } from '@/lib/navigation-shell'

const icons = {
  dashboard: LayoutDashboard,
  projects: FolderKanban,
  tools: Wrench,
  map: MapPinned,
  community: UsersRound,
  profile: UserRound,
}

const authenticatedNavItems = [
  { href: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { href: '/projects', icon: 'projects', label: 'Projects' },
  { href: '/map', icon: 'map', label: 'Map' },
  { href: '/community', icon: 'community', label: 'Community' },
  { href: '/account', icon: 'profile', label: 'Account' },
] as const

export default function MobileNav() {
  const pathname = usePathname()
  const [user, setUser] = useState<{ id?: string } | null>(null)
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setMounted(true)

    const dbClient = createClient()

    const loadSession = async () => {
      const { data: { session } } = await dbClient.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }

    loadSession()

    const { data: { subscription } } = dbClient.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (!mounted || loading || !user) return null

  const mobileNavItems = authenticatedNavItems

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[var(--bg-primary)] border-t border-[var(--border-color)] md:hidden z-50 safe-area-inset-bottom">
      <div className="flex justify-around items-stretch py-1">
        {mobileNavItems.map((item) => {
          const isActive = isNavItemActive(pathname, item.href)
          const Icon = icons[item.icon]
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 px-3 py-2 text-[10px] font-medium tracking-wide transition-colors min-w-0 flex-1 ${
                isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className={`h-5 w-5 transition-colors ${isActive ? 'text-[var(--accent)]' : ''}`} strokeWidth={1.9} />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
