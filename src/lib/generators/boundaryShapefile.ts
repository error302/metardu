import JSZip from 'jszip';
import db from '@/lib/db';
import { computeDeedPlanGeometry } from './deedPlanGeometry';
import { reportCrs } from './reportCrs';
import shpwrite from 'shp-write';

export async function generateBoundaryShapefile(projectId: string): Promise<Buffer> {
  const {rows}=await db.query<{ name: string; utm_zone: number | null; hemisphere: string | null; datum: string | null }>('SELECT name, utm_zone, hemisphere, datum FROM projects WHERE id=$1',[projectId]);
  const project=rows[0];
  if (!project) throw new Error('Project not found');
  const crs=reportCrs({utmZone:project.utm_zone ?? undefined,hemisphere:project.hemisphere ?? undefined,datum:project.datum ?? undefined});
  if(crs.epsg==='UNVERIFIED') throw new Error('Set a supported project datum, UTM zone and hemisphere before exporting a shapefile.');
  const geom=await computeDeedPlanGeometry(projectId);
  const ring=geom.stations.map(point=>[point.easting,point.northing]);
  const signed=ring.reduce((sum,point,index)=>{const next=ring[(index+1)%ring.length];return sum+point[0]*next[1]-next[0]*point[1]},0);
  if(signed>0) ring.reverse(); // ESRI exterior rings run clockwise.
  ring.push([...ring[0]]);
  const parts=await new Promise<{shp:DataView;shx:DataView;dbf:DataView}>((resolve,reject)=>{
    shpwrite.write([{AREA_M2:geom.areaM2,STATUS:'DRAFT'}],'POLYGON',[[ring]],(error,result)=>error?reject(error):resolve(result));
  });
  const arc=String(crs.epsg).startsWith('210');
  const geographic=arc?'GEOGCS["Arc 1960",DATUM["Arc_1960",SPHEROID["Clarke_1880_RGS",6378249.145,293.465]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]':'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
  const zone=Number(crs.zone);
  const prj=`PROJCS["${arc?'Arc 1960':'WGS 84'} / UTM zone ${zone}${crs.hemi}",${geographic},PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",${zone*6-183}],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",${crs.hemi==='S'?10000000:0}],UNIT["metre",1],AUTHORITY["EPSG","${crs.epsg}"]]`;
  const zip=new JSZip();
  for(const ext of ['shp','shx','dbf'] as const){const view=parts[ext];zip.file(`Boundary.${ext}`,Buffer.from(view.buffer,view.byteOffset,view.byteLength));}
  zip.file('Boundary.prj',prj);
  zip.file('Boundary.cpg','UTF-8');
  zip.file('README.txt','Draft parcel boundary from saved computed coordinates. Independently verify before use. No regulatory approval is asserted.');
  return zip.generateAsync({type:'nodebuffer'});
}
