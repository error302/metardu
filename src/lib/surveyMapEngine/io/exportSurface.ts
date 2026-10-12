/**
 * Export surface (plan Phase 4 / §3.1 `io/`).
 *
 * THE entry-point module for every map export generator. This is a thin
 * delegation layer: the actual generators live in `lib/map` / `lib/export`
 * and are NOT reimplemented here. In particular, the GIS exporters
 * (GeoJSON / LandXML) already fail closed on an undeclared CRS — that
 * behavior is preserved by re-exporting them verbatim; callers never get a
 * CRS defaulting path through this surface.
 */

export {
  exportDeedPlan,
  downloadDeedPlan,
} from '@/lib/map/deedPlanExport';

export {
  exportMapPDF,
  createPrintHandler,
} from '@/lib/export/exportMapPDF';

export { generateGeoJSON, downloadGeoJSON } from '@/lib/export/generateGeoJSON';
export {
  generateLandXML,
  downloadLandXML,
  type LandXMLProject,
  type LandXMLPoint,
} from '@/lib/export/generateLandXML';
