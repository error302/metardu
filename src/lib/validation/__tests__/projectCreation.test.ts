import { createProjectSchema } from '../projectCreation'

const base = { name: 'Synthetic project', survey_type: 'topographic', country: 'kenya' }
describe('new project reference declarations', () => {
  it('leaves absent reference fields unknown regardless of jurisdiction', () => {
    for (const country of ['kenya', 'uae', 'us']) {
      const project = createProjectSchema.parse({ ...base, country })
      expect(project.datum).toBeNull()
      expect(project.utm_zone).toBeUndefined()
      expect(project.hemisphere).toBeUndefined()
    }
  })
  it('accepts explicitly declared supported grids without changing them', () => {
    const project = { ...base, datum: 'WGS84', utm_zone: 37, hemisphere: 'S' }
    expect(createProjectSchema.parse(project)).toMatchObject(project)
    expect(createProjectSchema.safeParse({ ...project, datum: 'ARC1960' }).success).toBe(true)
  })
  it('rejects partial, unsupported or malformed declarations', () => {
    for (const reference of [
      { utm_zone: 37 }, { datum: 'WGS84' }, { datum: 'NAD83(CSRS)', utm_zone: 40, hemisphere: 'N' },
      { datum: 'ARC1960', utm_zone: 60, hemisphere: 'S' }, { datum: 'WGS84', utm_zone: 0, hemisphere: 'S' },
    ]) expect(createProjectSchema.safeParse({ ...base, ...reference }).success).toBe(false)
  })
})
