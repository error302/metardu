'use client';

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/api-client/client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { useLanguage, languages } from '@/lib/i18n/LanguageContext'
import MetarduLogo from '@/components/MetarduLogo'
import SubscriptionBadge from '@/components/SubscriptionBadge'
import type { PlanId } from '@/lib/subscription/catalog'
import { APP_SHELL_LINKS, PUBLIC_SHELL_LINKS, isExplicitPublicRoute, isNavItemActive } from '@/lib/navigation-shell'

/* ── Search index: all navigable pages for Ctrl+K ────────────────── */
const searchablePages = [
  // Tools - Calculations
  { category: 'Tools', group: 'Calculations', href: '/tools/distance', labelKey: 'tools.distance' },
  { category: 'Tools', group: 'Calculations', href: '/tools/bearing', labelKey: 'tools.bearingCalc' },
  { category: 'Tools', group: 'Calculations', href: '/tools/area', labelKey: 'tools.area' },
  { category: 'Tools', group: 'Calculations', href: '/tools/grade', labelKey: 'tools.grade' },
  // Tools - Traverse
  { category: 'Tools', group: 'Traverse', href: '/tools/traverse', labelKey: 'traverse.title' },
  { category: 'Tools', group: 'Traverse', href: '/tools/coordinates', labelKey: 'tools.coordinates' },
  { category: 'Tools', group: 'Traverse', href: '/tools/cogo', labelKey: 'tools.cogo' },
  { category: 'Tools', group: 'Traverse', href: '/tools/gnss', labelKey: 'tools.gnss' },
  // Tools - Levelling
  { category: 'Tools', group: 'Levelling', href: '/tools/leveling', labelKey: 'leveling.title' },
  { category: 'Tools', group: 'Levelling', href: '/tools/two-peg-test', labelKey: 'tools.twoPegTest' },
  // Tools - Curves & Roads
  { category: 'Tools', group: 'Curves & Roads', href: '/tools/curves', labelKey: 'tools.curves' },
  { category: 'Tools', group: 'Curves & Roads', href: '/tools/chainage', labelKey: 'tools.chainage' },
  { category: 'Tools', group: 'Curves & Roads', href: '/tools/tacheometry', labelKey: 'tools.tacheometry' },
  // Tools - Earthworks
  { category: 'Tools', group: 'Earthworks', href: '/tools/cross-sections', labelKey: 'tools.crossSections' },
  { category: 'Tools', group: 'Earthworks', href: '/tools/setting-out', labelKey: 'tools.settingOut' },
  // Tools - Specialized
  { category: 'Tools', group: 'Specialized', href: '/tools/mining', labelKey: 'tools.mining' },
  { category: 'Tools', group: 'Specialized', href: '/tools/hydrographic', labelKey: 'tools.hydrographic' },
  { category: 'Tools', group: 'Specialized', href: '/tools/drone', labelKey: 'tools.drone' },
  // Field
  { category: 'Field', group: 'Field', href: '/field', labelKey: 'field.fieldMode' },
  { category: 'Field', group: 'Field', href: '/fieldbook', labelKey: 'field.fieldBook' },
  { category: 'Field', group: 'Field', href: '/guide', labelKey: 'guides.title' },
  // Documents
  { category: 'Documents', group: 'Documents', href: '/deed-plan', labelKey: 'documents.deedPlan' },
  { category: 'Documents', group: 'Documents', href: '/tools/survey-report-builder', labelKey: 'documents.surveyReport' },
  { category: 'Documents', group: 'Documents', href: '/tools/beacon-certificate', labelKey: 'documents.beaconReference' },
  // Resources
  { category: 'Resources', group: 'Resources', href: '/online', labelKey: 'resources.datumConverter' },
  { category: 'Resources', group: 'Resources', href: '/kencors', labelKey: 'resources.kencorsRtk' },
  { category: 'Resources', group: 'Resources', href: '/docs', labelKey: 'resources.knowledgeBase' },
  { category: 'Resources', group: 'Resources', href: '/pricing', labelKey: 'nav.pricing' },
]

interface DropdownProps {
  label: string
  children: React.ReactNode
  isOpen: boolean
  onToggle: () => void
  align?: 'left' | 'right'
  buttonClassName?: string
  panelClassName?: string
}

function Dropdown({ label, children, isOpen, onToggle, align = 'left', buttonClassName, panelClassName }: DropdownProps) {
  return (
    <div className="relative group">
      <button 
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={
          buttonClassName ??
          'px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors flex items-center gap-1 rounded-lg hover:bg-white/5'
        }
      >
        {label}
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className={`absolute top-full ${align === 'right' ? 'right-0' : 'left-0'} pt-2 z-50`}>
          <div className={`bg-[var(--bg-secondary)] border border-[#E8841A20] rounded-lg shadow-xl ${panelClassName ?? 'min-w-[200px] py-2'}`}>
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

type Translator = (key: string, values?: Record<string, string | number>) => string

function GlobalSearch({ t, isAuthenticated }: { t: Translator; isAuthenticated: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const isMac = typeof navigator !== 'undefined' ? /mac|iphone|ipad|ipod/i.test(navigator.platform) : false
  const hint = isMac ? '⌘K' : 'Ctrl K'

  const searchIndex = useMemo(() => {
    const baseItems = searchablePages.map((p) => ({
      category: p.category,
      group: p.group,
      href: p.href,
      label: t(p.labelKey),
    }))

    return isAuthenticated
      ? [
          ...baseItems,
          { category: 'Navigation', group: 'Navigation', href: '/dashboard', label: t('nav.dashboard') },
        ]
      : [
          ...baseItems,
          { category: 'Auth', group: 'Auth', href: '/login', label: t('nav.login') },
          { category: 'Auth', group: 'Auth', href: '/register', label: t('nav.register') },
        ]
  }, [isAuthenticated, t])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return searchIndex.slice(0, 18)
    return searchIndex
      .filter((x) => `${x.label} ${x.group} ${x.category}`.toLowerCase().includes(q))
      .slice(0, 30)
  }, [query, searchIndex])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
        setTimeout(() => inputRef.current?.focus(), 100)
      }
      if (e.key === 'Escape') {
        setIsOpen(false)
        setQuery('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-tertiary)]/50 border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="hidden sm:inline">{t('nav.search')}</span>
        <kbd className="hidden sm:inline px-1.5 py-0.5 text-xs bg-gray-700 rounded">{hint}</kbd>
      </button>

      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-start justify-center pt-[15vh] z-50"
          onClick={() => { setIsOpen(false); setQuery(''); }}
        >
          <div 
            className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl w-full max-w-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-4 border-b border-[var(--border-color)]">
              <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('nav.search')}
                className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none"
              />
              <kbd className="px-2 py-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded">ESC</kbd>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="p-4 text-sm text-[var(--text-secondary)]">{t('common.noResults')}</div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((item) => (
                    <Link
                      key={`${item.href}|${item.label}`}
                      href={item.href}
                      onClick={() => {
                        setIsOpen(false)
                        setQuery('')
                      }}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] rounded-lg"
                    >
                      <span>{item.label}</span>
                      <span className="text-xs text-[var(--text-muted)]">{item.group}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function NavBar() {
  const [user, setUser] = useState<{ email: string; id?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [showInstall, setShowInstall] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [userPlan, setUserPlan] = useState<PlanId>('free')
  const navRef = useRef<HTMLDivElement>(null)

  const { language, setLanguage, t, hydrated } = useLanguage()
  const pathname = usePathname()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const dbClient = createClient()
    
    const getUser = async () => {
      const { data: { session } } = await dbClient.auth.getSession()
      const user = session?.user ?? null
      setUser(user as { email: string; id?: string } | null)
      if (user) {
        const { data: sub } = await dbClient
          .from('user_subscriptions')
          .select('plan_id')
          .eq('user_id', user.id)
          .maybeSingle()
        setUserPlan((sub?.plan_id as PlanId) || 'free')
      } else {
        setUserPlan('free')
      }
      setLoading(false)
    }
    
    getUser()

    const { data: { subscription } } = dbClient.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user as { email: string; id?: string } | null
      setUser(u)
      if (u?.id) {
        const { data: sub } = await dbClient
          .from('user_subscriptions')
          .select('plan_id')
          .eq('user_id', u.id)
          .maybeSingle()
        setUserPlan((sub?.plan_id as PlanId) || 'free')
      } else {
        setUserPlan('free')
      }
      setLoading(false)
    })

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
      setShowInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    const prompt = await installPrompt.prompt()
    if (prompt.outcome === 'accepted') {
      setShowInstall(false)
    }
  }

  const handleSignOut = async () => {
    // Sign out via NextAuth
    try {
      const { signOut } = await import('next-auth/react')
      await signOut({ redirect: false })
    } catch {
      // Fallback: call signout API directly
      await fetch('/api/auth/signout', { method: 'POST' })
    }
    window.location.href = '/'
  }

  const handleDropdownToggle = (name: string) => {
    setOpenDropdown(openDropdown === name ? null : name)
  }

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (navRef.current && navRef.current.contains(target)) return
      setOpenDropdown(null)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdown(null)
    }

    document.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('keydown', onEsc)
    }
  }, [])

  useEffect(() => {
    setMobileMenuOpen(false)
    setOpenDropdown(null)
  }, [pathname])

  const currentLang = languages.find((l: any) => l.code === language) || languages[0]
  const shellVariant = !loading && !user && isExplicitPublicRoute(pathname) ? 'public' : 'app'
  const desktopLinks = shellVariant === 'app' ? APP_SHELL_LINKS : PUBLIC_SHELL_LINKS
  const mobileLinks = shellVariant === 'app' ? APP_SHELL_LINKS : PUBLIC_SHELL_LINKS

  if (!mounted) {
    return (
      <div className="h-16 border-b border-[var(--border-color)] bg-[#0a0a0f]" />
    )
  }

  return (
    <nav className="border-b border-[var(--border-color)] bg-[#0a0a0f] sticky top-0 z-50">
      <div ref={navRef} className="max-w-7xl mx-auto px-4">
        {/* Main Navbar */}
        <div className="h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" prefetch={false}>
            <MetarduLogo color="var(--accent)" size={28} showWordmark={true} />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {desktopLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={`px-3 py-2 text-sm transition-colors rounded-lg ${item.icon ? 'inline-flex items-center gap-1.5' : ''} ${
                  isNavItemActive(pathname, item.href)
                    ? 'text-[var(--accent)] bg-white/5'
                    : 'text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-white/5'
                }`}
              >
                {item.icon === 'map' ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                ) : null}
                {item.label}
              </Link>
            ))}
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            {/* Global Search */}
            <GlobalSearch t={t} isAuthenticated={Boolean(user)} />

            {/* Language Selector */}
            <Dropdown
              label={`${currentLang.flag} ${currentLang.code.toUpperCase()}`}
              isOpen={openDropdown === 'lang'}
              onToggle={() => handleDropdownToggle('lang')}
              align="right"
              panelClassName="min-w-[180px] py-1"
              buttonClassName="flex items-center gap-2 px-2 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors rounded-lg hover:bg-white/5"
            >
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code)
                    setOpenDropdown(null)
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-white/5 ${
                    language === lang.code ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
                  }`}
                >
                  {lang.flag} {lang.name}
                </button>
              ))}
            </Dropdown>

            {loading ? (
              <div className="w-20 h-8 bg-[var(--bg-tertiary)] animate-pulse rounded"></div>
            ) : user ? (
              <div className="hidden md:block relative">
                <button
                  onClick={() => handleDropdownToggle('user')}
                  aria-expanded={openDropdown === 'user'}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]/40 hover:border-[var(--accent)] transition-colors"
                >
                  <span className="w-8 h-8 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/30 text-[var(--accent)] flex items-center justify-center font-bold">
                    {(user.email || 'U').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="hidden lg:flex flex-col">
                    <span className="text-sm text-[var(--text-primary)] max-w-[180px] truncate leading-tight">{user.email}</span>
                    <SubscriptionBadge plan={userPlan} compact />
                  </div>
                  <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {openDropdown === 'user' && (
                  <div className="absolute top-full right-0 pt-2 z-50">
                    <div className="bg-[var(--bg-secondary)] border border-[#E8841A20] rounded-lg shadow-xl min-w-[220px] py-2">
                      <div className="px-4 pb-2 flex items-center justify-between">
                        <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">Account</div>
                        <SubscriptionBadge plan={userPlan} compact />
                      </div>
                      <div className="px-4 py-2">
                        <Link
                          href="/dashboard"
                          onClick={() => setOpenDropdown(null)}
                          className="block px-2 py-1.5 text-sm text-[var(--text-primary)] hover:text-[var(--accent)] hover:bg-white/5 rounded"
                        >
                          {t('nav.dashboard')}
                        </Link>
                        <Link
                          href="/account"
                          onClick={() => setOpenDropdown(null)}
                          className="block px-2 py-1.5 text-sm text-[var(--text-primary)] hover:text-[var(--accent)] hover:bg-white/5 rounded"
                        >
                          Account Settings
                        </Link>
                        <Link
                          href="/account/billing"
                          onClick={() => setOpenDropdown(null)}
                          className="block px-2 py-1.5 text-sm text-[var(--text-primary)] hover:text-[var(--accent)] hover:bg-white/5 rounded"
                        >
                          Billing
                        </Link>
                        <Link
                          href="/notifications"
                          onClick={() => setOpenDropdown(null)}
                          className="block px-2 py-1.5 text-sm text-[var(--text-primary)] hover:text-[var(--accent)] hover:bg-white/5 rounded"
                        >
                          Notifications
                        </Link>
                      </div>
                      <div className="border-t border-white/5 my-2" />
                      <div className="px-4">
                        <button
                          onClick={() => {
                            setOpenDropdown(null)
                            handleSignOut()
                          }}
                          className="w-full text-left px-2 py-2 text-sm text-red-200 hover:bg-white/5 rounded"
                        >
                          {t('nav.signOut')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              ) : (
              <div className="hidden md:flex items-center gap-2">
                <Link href="/login" className="px-4 py-2 text-sm border border-[var(--accent)] text-[var(--accent)] rounded hover:bg-[var(--accent)]/10 transition-colors">
                  Log In
                </Link>
                <Link href="/register" className="px-4 py-2 text-sm bg-[var(--accent)] text-black font-semibold rounded hover:bg-[var(--accent-dim)] transition-colors">
                  Get Started
                </Link>
              </div>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="md:hidden p-2 text-[var(--text-primary)]"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#0a0a0f] border-t border-[var(--border-color)] max-h-[80vh] overflow-y-auto pb-4">
            <div className="py-2">
              {mobileLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={`block px-4 py-2 transition-colors ${
                    isNavItemActive(pathname, item.href)
                      ? 'text-[var(--accent)]'
                      : 'text-[var(--text-primary)] hover:text-[var(--accent)]'
                  }`}
                >
                  {item.label}
                </Link>
              ))}

              {shellVariant === 'app' && (
                <>
                  <div className="border-t border-[var(--border-color)] my-2"></div>
                  <div className="px-4 py-1">
                    <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Field Operations</span>
                  </div>
                  <Link href="/schedule" className="block px-4 py-2 text-[var(--text-primary)] hover:text-[var(--accent)]">
                    Job Schedule
                  </Link>
                  <Link href="/equipment" className="block px-4 py-2 text-[var(--text-primary)] hover:text-[var(--accent)]">
                    Equipment Tracker
                  </Link>
                  <Link href="/jobs" className="block px-4 py-2 text-[var(--text-primary)] hover:text-[var(--accent)]">
                    Field Missions
                  </Link>
                  <Link href="/marketplace" className="block px-4 py-2 text-[var(--text-primary)] hover:text-[var(--accent)]">
                    Equipment Marketplace
                  </Link>
                  <Link href="/field" className="block px-4 py-2 text-[var(--text-primary)] hover:text-[var(--accent)]">
                    {t('field.fieldMode')}
                  </Link>
                  <Link href="/docs" className="block px-4 py-2 text-[var(--text-primary)] hover:text-[var(--accent)]">
                    Documentation
                  </Link>
                </>
              )}
              
              {user && (
                <>
                  <div className="border-t border-[var(--border-color)] my-2"></div>
                  <Link href="/account" className="block px-4 py-2 text-[var(--text-primary)] hover:text-[var(--accent)]">
                    Account
                  </Link>
                  <button onClick={handleSignOut} className="block w-full text-left px-4 py-2 text-[var(--text-primary)] hover:text-[var(--accent)]">
                    {t('nav.signOut')}
                  </button>
                </>
              )}
              
              {!user && (
                <>
                  <div className="border-t border-[var(--border-color)] my-2"></div>
                  <Link href="/login" className="block px-4 py-2 text-[var(--accent)]">
                    Log In
                  </Link>
                  <Link href="/register" className="block px-4 py-2 text-[var(--accent)] font-semibold">
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
