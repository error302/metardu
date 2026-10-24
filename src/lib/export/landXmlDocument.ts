import { reportCrs, describeVerticalDatum } from '@/lib/generators/reportCrs'
import { validateCoordinateRange } from '@/lib/spatial/projectCrs'

export interface LandXMLProject {
  name:string;location?:string;utm_zone?:number;hemisphere?:string;datum?:string
  vertical_datum?:string;vertical_reference?:string;geoid_model?:string;benchmark_basis?:string
  /** Source/evidence statements carried using schema-defined Feature properties. */
  metadata?:Record<string,string>
}
export interface LandXMLPoint {
  name:string;easting:number;northing:number;elevation?:number|null;is_control:boolean
  metadata?:Record<string,string>
}
export interface LandXMLPlanFeature {
  name:string;pointRefs:string[];metadata?:Record<string,string>
}

/** LandXML 1.2: root Units, CoordinateSystem attributes and standard Feature extensions. */
export function generateLandXML(project:LandXMLProject,points:LandXMLPoint[],planFeatures:LandXMLPlanFeature[]=[]):string {
  const date=new Date().toISOString()
  const crs=reportCrs({utmZone:project.utm_zone,hemisphere:project.hemisphere,datum:project.datum,
    verticalDatum:project.vertical_datum,verticalReference:project.vertical_reference,
    geoidModel:project.geoid_model,benchmarkBasis:project.benchmark_basis})
  if(!crs.verified)throw new Error('LandXML export requires a declared, supported project CRS (datum, UTM zone, and hemisphere).')
  if(!project.name.trim())throw new Error('LandXML project name is required.')
  const names=new Set<string>()
  for(const point of points){
    if(!point.name.trim()||names.has(point.name))throw new Error('LandXML point names must be nonblank and unique; duplicate names cannot identify point references.')
    names.add(point.name)
    if(!Number.isFinite(point.easting)||!Number.isFinite(point.northing))throw new Error('LandXML coordinates must be finite.')
    const range=validateCoordinateRange(point.easting,point.northing,crs.epsgCode)
    if(!range.valid)throw new Error(`LandXML coordinate is outside the declared grid: ${range.errors.join('; ')}`)
    if(point.elevation!=null&&!Number.isFinite(point.elevation))throw new Error('LandXML elevation must be finite or explicitly unknown.')
  }
  const planNames=new Set<string>()
  for(const feature of planFeatures){
    if(!feature.name.trim()||planNames.has(feature.name))throw new Error('LandXML plan feature names must be nonblank and unique.')
    planNames.add(feature.name)
    if(feature.pointRefs.length<2||feature.pointRefs.some(name=>!names.has(name)))throw new Error('A LandXML plan feature has incomplete or missing point references.')
  }
  const featureXml=(name:string,metadata:Record<string,string>)=>`<Feature name="${escapeXml(name)}" code="METARDU_METADATA" source="METARDU">${Object.entries(metadata).map(([label,value])=>`<Property label="${escapeXml(label)}" value="${escapeXml(value)}"/>`).join('')}</Feature>`
  const verticalDescription=describeVerticalDatum(crs)
  const cgPoints=points.map(point=>`<CgPoint name="${escapeXml(point.name)}" code="${point.is_control?'CTRL':'SURV'}">${point.northing} ${point.easting}${point.elevation==null?'':` ${point.elevation}`}</CgPoint>`).join('\n')
  const pointMetadata=points.filter(point=>point.metadata).map(point=>featureXml(point.name,point.metadata??{})).join('\n')
  const plans=planFeatures.map(feature=>`<PlanFeature name="${escapeXml(feature.name)}"><CoordGeom>${feature.pointRefs.slice(1).map((to,index)=>`<Line><Start pntRef="${escapeXml(feature.pointRefs[index])}"/><End pntRef="${escapeXml(to)}"/></Line>`).join('')}</CoordGeom>${feature.metadata?featureXml(feature.name,feature.metadata):''}</PlanFeature>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2" date="${date.slice(0,10)}" time="${date.slice(11,19)}" language="English" readOnly="false" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.landxml.org/schema/LandXML-1.2 http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd">
  <Units><Metric linearUnit="meter" elevationUnit="meter" areaUnit="squareMeter" volumeUnit="cubicMeter" temperatureUnit="celsius" pressureUnit="milliBars" angularUnit="decimal degrees" directionUnit="decimal degrees"/></Units>
  <Application name="METARDU" manufacturer="METARDU"/>
  <Project name="${escapeXml(project.name)}" desc="${escapeXml(project.location??'')}"/>
  <CoordinateSystem name="${escapeXml(crs.crsName)}" epsgCode="${crs.epsg}" horizontalDatum="${escapeXml(crs.datum)}" ellipsoidName="${escapeXml(crs.ellipsoid)}"${crs.vertical?` verticalDatum="${escapeXml(crs.vertical.datum)}"`:''}>
    ${featureXml('METARDU coordinate provenance',{
      ...project.metadata,zone:String(crs.zone),hemisphere:crs.hemi,ellipsoidA:String(crs.ellipsoidA),ellipsoidInvF:String(crs.ellipsoidInvF),
      centralMeridian:String(crs.zone*6-183),falseEasting:'500000',falseNorthing:crs.hemi==='S'?'10000000':'0',scaleFactor:'0.9996',
      verticalDescription,verticalReference:crs.vertical?.reference??'unverified',geoidModel:crs.vertical?.geoidModel??'undeclared',
      benchmarkBasis:crs.vertical?.benchmarkBasis??'undeclared',
    })}
  </CoordinateSystem>
  <CgPoints name="${escapeXml(project.name)}">${cgPoints}${pointMetadata}</CgPoints>
  ${planFeatures.length?`<PlanFeatures name="METARDU retained drawing geometry">${plans}</PlanFeatures>`:''}
</LandXML>`
}

function escapeXml(value:string):string {
  for(const character of value){
    const code=character.codePointAt(0)??0
    if(code<32&&![9,10,13].includes(code)||code>=0xd800&&code<=0xdfff||code===0xfffe||code===0xffff)throw new Error('LandXML contains an illegal XML character. Retain the original record and correct its text before exporting.')
  }
  return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/\t/g,'&#9;').replace(/\n/g,'&#10;').replace(/\r/g,'&#13;')
}
export function downloadLandXML(project:LandXMLProject,points:LandXMLPoint[],planFeatures:LandXMLPlanFeature[]=[]):void {
  const xml=generateLandXML(project,points,planFeatures)
  const url=URL.createObjectURL(new Blob([xml],{type:'application/xml'})),link=document.createElement('a')
  link.href=url;link.download=`${project.name.replace(/\s+/g,'_')}_export.xml`
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
