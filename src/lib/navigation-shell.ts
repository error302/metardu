export type PrimaryNavItem = {
  href: string
  label: string
  icon?: 'map'
}

export const APP_SHELL_LINKS: PrimaryNavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/map', label: 'Map', icon: 'map' },
  { href: '/community', label: 'Community' },
  { href: '/account', label: 'Account' },
]

export const PUBLIC_SHELL_LINKS: PrimaryNavItem[] = [
  { href: '/tools', label: 'Tools' },
  { href: '/guide', label: 'Guide' },
  { href: '/online', label: 'Online' },
  { href: '/community', label: 'Community' },
  { href: '/docs', label: 'Docs' },
]

export function isExplicitPublicRoute(pathname: string | null | undefined) {
  const path = pathname || '/'

  if (path === '/' || path === '/community') return true

  return [
    '/docs',
    '/guide',
    '/pricing',
    '/online',
    '/login',
    '/register',
    '/tools',
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
