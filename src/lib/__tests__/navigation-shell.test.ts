import { isExplicitPublicRoute, isWebsiteRoute, PUBLIC_SHELL_LINKS } from '../navigation-shell'

describe('navigation shells', () => {
  it('keeps workspace destinations out of the public navigation', () => {
    const protectedPaths = new Set(['/dashboard', '/projects', '/map', '/fieldbook', '/equipment', '/tools', '/reports'])
    expect(PUBLIC_SHELL_LINKS.some(item => protectedPaths.has(item.href))).toBe(false)
    expect(PUBLIC_SHELL_LINKS.map(item => item.href)).toEqual([
      '/', '/demo', '/marketplace', '/community', '/pricing',
    ])
  })

  it('recognizes the product demo as a public route', () => {
    expect(isExplicitPublicRoute('/demo')).toBe(true)
    expect(isExplicitPublicRoute('/demo/field-collection')).toBe(true)
    expect(isExplicitPublicRoute('/dashboard')).toBe(false)
  })
})

it('keeps website presentation stable while signed in',()=>{
 for(const path of ['/','/pricing','/install','/docs','/docs/field'])expect(isWebsiteRoute(path)).toBe(true)
 for(const path of ['/dashboard','/schedule','/projects','/field/collect','/admin'])expect(isWebsiteRoute(path)).toBe(false)
})
