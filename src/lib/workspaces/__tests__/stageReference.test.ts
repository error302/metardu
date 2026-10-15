import { resolveStageReference, resolveDeclaredStageReference } from '../stageReference'

const wgs84Zone36S = 'EPSG:' + (32700 + 36)
const wgs84Zone36N = 'EPSG:' + (32600 + 36)

describe('stage reference system', () => {
  it('uses a dedicated API record without guessing missing or incompatible fields', () => {
    const prs = { horizontalCrs:wgs84Zone36S,horizontalName:'WGS84 UTM 36S',datum:'WGS84',units:'metres',zone:36,hemisphere:'S',verticalDatum:'Declared BM',distanceMode:'grid',coordinatePrecision:3 }
    expect(resolveDeclaredStageReference({prs})).toMatchObject({code:wgs84Zone36S,source:'declared',verticalDatum:'Declared BM'})
    for (const value of [null,{}, {prs:{...prs,units:'degrees'}}, {prs:{...prs,zone:37}}, {prs:{...prs,distanceMode:undefined}}]) expect(resolveDeclaredStageReference(value).code).toBeNull()
  })
  it('uses the declared project CRS even when legacy zone fields disagree', () => {
    const reference = resolveStageReference(
      {
        horizontal_crs: wgs84Zone36S,
        horizontal_name: 'WGS 84 / UTM zone 36S',
        datum_name: 'WGS 84',
        hemisphere: 'S',
        distance_mode: 'grid',
        coordinate_precision: 3,
      },
      { datum: 'Arc 1960', utm_zone: 37, hemisphere: 'S' },
    )
    expect(reference).toMatchObject({
      code: wgs84Zone36S,
      name: 'WGS 84 / UTM zone 36S',
      source: 'declared',
    })
  })

  it('labels an explicit legacy CRS without guessing Arc 1960', () => {
    expect(resolveStageReference(null, {
      datum: 'WGS84', utm_zone: 36, hemisphere: 'N',
    })).toMatchObject({ code: wgs84Zone36N, source: 'legacy' })
  })

  it('does not plot coordinates with an undeclared or invalid CRS', () => {
    expect(resolveStageReference(null, {
      datum: null, utm_zone: 37, hemisphere: 'S',
    }).code).toBeNull()
    expect(resolveStageReference({
      horizontal_crs: 'EPSG:3857',
      datum_name: 'WGS 84',
      distance_mode: 'grid',
      coordinate_precision: 3,
    }, {
      datum: 'Arc 1960', utm_zone: 37, hemisphere: 'S',
    }).code).toBeNull()
    expect(resolveStageReference({
      horizontal_crs: wgs84Zone36S,
      datum_name: 'WGS 84',
      zone: 37,
      hemisphere: 'S',
      distance_mode: 'grid',
      coordinate_precision: 3,
    }, {
      datum: 'Arc 1960', utm_zone: 37, hemisphere: 'S',
    }).code).toBeNull()
  })
})

