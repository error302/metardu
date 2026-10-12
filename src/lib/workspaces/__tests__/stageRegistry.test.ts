import fs from 'fs'
import path from 'path'
import {
  STAGES,

  getStageDefinition,
  stageHref,
  stageToolHrefs,
} from '../stageRegistry'

const APP_DIR = path.join(process.cwd(), 'src', 'app')

function routeExists(href: string): boolean {
  const rel = href
    .replace('/project/{id}', '/project/[id]')
    .replace(/^\//, '')
  return fs.existsSync(path.join(APP_DIR, rel, 'page.tsx'))
}

describe('stageRegistry', () => {
  it('defines the seven workflow stages in blueprint order', () => {
    expect(STAGES.map((s) => s.id)).toEqual([
      'overview',
      'control',
      'observe',
      'compute',
      'design',
      'verify',
      'deliver',
    ])
  })

  it('gives every stage a purpose and scope', () => {
    for (const stage of STAGES) {
      expect(stage.purpose.length).toBeGreaterThan(20)
      expect(stage.scope.length).toBeGreaterThan(0)
      expect(stage.tools.length).toBeGreaterThan(0)
    }
  })

  it('maps overview to the project root and others to sub-routes', () => {
    const overview = getStageDefinition('overview')
    const control = getStageDefinition('control')
    expect(stageHref('p1', overview)).toBe('/project/p1')
    expect(stageHref('p1', control)).toBe('/project/p1/control')
  })

  it('substitutes the project id into tool links with no tokens left', () => {
    for (const stage of STAGES) {
      for (const tool of stageToolHrefs(stage, 'proj-42')) {
        expect(tool.href).not.toContain('{id}')
        expect(tool.href.startsWith('/')).toBe(true)
        if (tool.href.startsWith('/project/')) {
          expect(tool.href).toContain('proj-42')
        }
      }
    }
  })

  it('restricts control stage states to the blueprint set', () => {
    expect(getStageDefinition('control').states).toEqual([
      'DRAFT',
      'OBSERVED',
      'COMPUTED',
      'REVIEW_REQUIRED',
      'VERIFIED',
      'SUPERSEDED',
      'DISTURBED',
    ])
  })

  it('ships a page for every stage route', () => {
    for (const stage of STAGES) {
      if (!stage.path) continue
      const page = path.join(APP_DIR, 'project', '[id]', stage.path, 'page.tsx')
      expect(fs.existsSync(page)).toBe(true)
    }
  })

  it('every stage tool link resolves to a real page', () => {
    for (const stage of STAGES) {
      for (const tool of stage.tools) {
        expect({ stage: stage.id, href: tool.href, exists: routeExists(tool.href) })
          .toEqual({ stage: stage.id, href: tool.href, exists: true })
      }
    }
  })
})

