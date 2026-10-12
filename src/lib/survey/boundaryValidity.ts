type Point = {easting:number;northing:number};
/** Validate planar grid geometry independently of traverse closure. */
export function hasCrossingBoundary(points:Point[]):boolean {
  const cross=(a:Point,b:Point,c:Point)=>(b.easting-a.easting)*(c.northing-a.northing)-(b.northing-a.northing)*(c.easting-a.easting);
  const on=(a:Point,b:Point,p:Point)=>Math.abs(cross(a,b,p))<1e-8 && p.easting>=Math.min(a.easting,b.easting)-1e-8 && p.easting<=Math.max(a.easting,b.easting)+1e-8 && p.northing>=Math.min(a.northing,b.northing)-1e-8 && p.northing<=Math.max(a.northing,b.northing)+1e-8;
  for(let i=0;i<points.length;i++) for(let j=i+1;j<points.length;j++) {
    if(j===i+1 || (i===0 && j===points.length-1)) continue;
    const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
    if((cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) || on(a,b,c) || on(a,b,d) || on(c,d,a) || on(c,d,b)) return true;
  }
  return false;
}
