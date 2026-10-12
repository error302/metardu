import { readFileSync } from 'fs'
import { join } from 'path'

const routeSource = readFileSync(join(__dirname, '../src/app/api/spatial-index/route.ts'), 'utf8')

describe('global map project-point CRS contract', () => {
  it('transforms each project beacon using its declared horizontal CRS', () => {
    const beaconBranch = routeSource.match(/if \(types\.includes\('beacon'\)\)[\s\S]*?const result = await db\.query[\s\S]*?`([\s\S]*?)`/)
    expect(beaconBranch).not.toBeNull()
    const sql = beaconBranch?.[1] ?? ''
    expect(sql).toContain('JOIN project_reference_systems prs')
    expect(sql).toContain('prs.horizontal_crs')
    expect(sql).toContain('ST_Transform')
    expect(sql).not.toContain('21037), 4326')
  })

  it('does not invent a CRS for parcel geometries with SRID 0', () => {
    const parcelBranch = routeSource.match(/if \(types\.includes\('parcel'\)\)[\s\S]*?const result = await db\.query[\s\S]*?`([\s\S]*?)`/)
    expect(parcelBranch).not.toBeNull()
    const sql = parcelBranch?.[1] ?? ''
    expect(sql).toContain('ST_SRID(p.geom) <> 0')
    expect(sql).toContain('FROM spatial_ref_sys')
    expect(sql).not.toContain('COALESCE(NULLIF(ST_SRID(p.geom), 0), 21037)')
  })
})
