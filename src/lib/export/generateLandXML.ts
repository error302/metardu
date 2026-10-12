import { reportCrs, describeVerticalDatum } from '@/lib/generators/reportCrs'

export interface LandXMLProject {
  name: string
  location?: string
  utm_zone?: number
  hemisphere?: string
  /** Declared project datum (e.g. 'Arc 1960', 'WGS84'). Omit if undeclared. */
  datum?: string
  /** Declared vertical datum fields (project_reference_systems columns). */
  vertical_datum?: string
  vertical_reference?: string
  geoid_model?: string
  benchmark_basis?: string
}

export interface LandXMLPoint {
  name: string
  easting: number
  northing: number
  elevation?: number | null
  is_control: boolean
}

export function generateLandXML(
  project: LandXMLProject,
  points: LandXMLPoint[]
): string {
  const date = new Date().toISOString()

  // A deliverable with coordinates but no resolvable horizontal CRS cannot
  // be safely imported by another survey system. Refuse it before writing XML.
  const crs = reportCrs({
    utmZone: project.utm_zone,
    hemisphere: project.hemisphere,
    datum: project.datum,
    verticalDatum: project.vertical_datum,
    verticalReference: project.vertical_reference,
    geoidModel: project.geoid_model,
    benchmarkBasis: project.benchmark_basis,
  })
  if (!crs.verified) {
    throw new Error('LandXML export requires a declared, supported project CRS (datum, UTM zone, and hemisphere).')
  }
  const datumXml = `<Datum name="${escapeXml(crs.datum)}">
      <Ellipsoid name="${escapeXml(crs.ellipsoid)}" a="${crs.ellipsoidA}" invF="${crs.ellipsoidInvF}"/>
    </Datum>`
  // LandXML 1.2 requires an explicit <Units> element inside <CoordinateSystem>;
  // without it the file is schema-invalid and importing systems reject it
  // (blueprint P0 "Fix LandXML project metadata"). Survey work is metric here,
  // so this is stated, not assumed.
  const unitsXml = `<Units>
      <Metric linearUnit="meter" areaUnit="squareMeter" volumeUnit="cubicMeter"
        temperatureUnit="celsius" pressureUnit="milliBars"
        angularUnit="decimal degrees" directionUnit="decimal degrees"/>
    </Units>`
  // The vertical reference must be machine-readable, not an XML comment: a
  // receiving system cannot act on prose.
  const verticalDescription = describeVerticalDatum(crs)
  const verticalXml = `<VerticalDatum name="${escapeXml(verticalDescription)}"/>`
  const z = crs.zone
  const h = crs.hemi
  const projectionXml = `
    <Projection name="UTM Zone ${z}${h}"
      type="TransverseMercator"
      zone="${z}"
      hemisphere="${h}"
      originLat="0"
      originLong="${z * 6 - 183}"
      scaleFactor="0.9996"
      falseEasting="500000"
      falseNorthing="${h === 'S' ? '10000000' : '0'}"/>`

  const cgPoints = points.map((p) => `
    <CgPoint name="${escapeXml(p.name)}" 
      pntRef="${escapeXml(p.name)}"
      featureCode="${p.is_control ? 'CTRL' : 'SURV'}">
      ${p.northing.toFixed(4)} ${p.easting.toFixed(4)} ${(p.elevation || 0).toFixed(4)}
    </CgPoint>`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2"
  version="1.2" date="${date.slice(0,10)}" time="${date.slice(11,19)}"
  language="English" readOnly="false"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.landxml.org/schema/LandXML-1.2 http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd">
  <Header>
    <Creator>METARDU - Professional Surveying Platform</Creator>
    <Created>${date.slice(0,19)}</Created>
    <Name>${escapeXml(project.name)}</Name>
  </Header>
  <Project name="${escapeXml(project.name)}">
    <Description>${escapeXml(project.location || '')}</Description>
  </Project>
  <CoordinateSystem name="${escapeXml(crs.crsName)}" epsgCode="${crs.epsg}">
    ${unitsXml}
    ${datumXml}${projectionXml}
${verticalXml}
  </CoordinateSystem>
  <CgPoints>
    ${cgPoints}
  </CgPoints>
  <Survey>
    <SurveyHeader name="${escapeXml(project.name)}" 
      date="${date.slice(0,10)}"
      startDate="${date.slice(0,10)}"
      endDate="${date.slice(0,10)}"
      surveyor="METARDU User"
      surveyType="Topographic"/>
  </Survey>
</LandXML>`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function downloadLandXML(
  project: LandXMLProject,
  points: LandXMLPoint[]
): void {
  const xml = generateLandXML(project, points)
  const blob = new Blob([xml], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.name.replace(/\s+/g, '_')}_export.xml`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
