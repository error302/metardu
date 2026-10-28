export type PrimaryNavItem = {
  href: string
  label: string
  icon?: 'map' | 'tools' | 'reports'
}

/**
 * METARDU Navigation Shell — Single Source of Truth
 *
 * These items are the primary navigation for authenticated users.
 * They follow the Kenyan cadastral surveyor workflow:
 *   Dashboard → Field Book → Map → Tools → Reports → Community
 *
 * The Map is positioned AFTER Field Book because the natural workflow is:
 *   1. Open project → 2. Record field observations → 3. View/map data → 4. Compute → 5. Generate reports
 *
 * Account appears in the user dropdown (not in the main nav).
 */
export const PRIMARY_NAV_ITEMS: PrimaryNavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/map', label: 'Survey Map', icon: 'map' },
  { href: '/fieldbook', label: 'Field Book' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/equipment', label: 'Equipment' },
  { href: '/tools', label: 'Toolbox', icon: 'tools' },
  { href: '/reports', label: 'Documents', icon: 'reports' },
]

/**
 * @deprecated Use PRIMARY_NAV_ITEMS instead. Kept for backward compatibility.
 */
export const APP_SHELL_LINKS: PrimaryNavItem[] = PRIMARY_NAV_ITEMS

export type NavMenuItem = PrimaryNavItem & { description?: string }
export type NavGroup = { id: string; label: string; items: NavMenuItem[] }
export type DesktopNavEntry = { kind: 'link'; item: PrimaryNavItem } | { kind: 'group'; group: NavGroup }

/**
 * Desktop top-bar structure for signed-in users. Every PRIMARY_NAV_ITEMS
 * destination is reachable from here in at most one click-open, so the
 * desktop never depends on the collapsible menu. The field group follows
 * the surveyor's order of work: collect → set out → review on the map.
 */
export const APP_DESKTOP_NAV: DesktopNavEntry[] = [
  { kind: 'link', item: { href: '/dashboard', label: 'Dashboard' } },
  { kind: 'link', item: { href: '/projects', label: 'Projects' } },
  {
    kind: 'group',
    group: {
      id: 'field',
      label: 'Field',
      items: [
        { href: '/field/collect', label: 'Collect points', description: 'Record shots against a job' },
        { href: '/field/setout', label: 'Set out', description: 'Stake design points and chainages' },
        { href: '/fieldbook', label: 'Field Book', description: 'Observation books and reductions' },
        { href: '/map', label: 'Survey Map', icon: 'map', description: 'Review points on the map' },
        { href: '/schedule', label: 'Job schedule', description: 'Crew days and site visits' },
        { href: '/beacons', label: 'Beacon registry', description: 'Control and boundary marks' },
      ],
    },
  },
  { kind: 'link', item: { href: '/tools', label: 'Toolbox', icon: 'tools' } },
  { kind: 'link', item: { href: '/reports', label: 'Documents', icon: 'reports' } },
  {
    kind: 'group',
    group: {
      id: 'more',
      label: 'More',
      items: [
        { href: '/equipment', label: 'Equipment', description: 'Instruments and calibration' },
        { href: '/marketplace', label: 'Marketplace', description: 'Buy, sell and hire gear' },
        { href: '/docs', label: 'Documentation', description: 'Guides and method notes' },
      ],
    },
  },
]

export function isNavGroupActive(pathname: string | null | undefined, group: NavGroup) {
  return group.items.some((item) => isNavItemActive(pathname, item.href))
}

/**
 * Public routes use product and company destinations rather than protected
 * workspace pages.
 */
export const PUBLIC_SHELL_LINKS: PrimaryNavItem[] = [
  { href: '/', label: 'Home' },
  { href: '/demo', label: 'Product demo' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/community', label: 'Community' },
  { href: '/pricing', label: 'Pricing' },
]

export function isExplicitPublicRoute(pathname: string | null | undefined) {
  const path = pathname || '/'

  if (path === '/' || path === '/marketplace' || path === '/community') return true

  return [
    '/docs',
    '/guide',
    '/pricing',
    '/install',
    '/offline',
    '/demo',
    '/online',
    '/login',
    '/register',
    '/tools',
    '/p',
  ].some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

export function isNavItemActive(pathname: string | null | undefined, href: string) {
  const path = pathname || '/'

  if (href === '/dashboard') {
    return path === '/dashboard'
  }

  if (href === '/projects') {
    return path === '/projects' || path.startsWith('/project/')
  }

  if (href === '/account') {
    return path === '/account' || path.startsWith('/account/') || path === '/profile' || path.startsWith('/profile/')
  }

  return path === href || path.startsWith(`${href}/`)
}
