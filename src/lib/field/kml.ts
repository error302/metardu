import * as toGeoJSON from '@tmcw/togeojson';
import JSZip from 'jszip';

export async function parseKML(text: string): Promise<GeoJSON.FeatureCollection> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  return toGeoJSON.kml(doc) as GeoJSON.FeatureCollection;
}

export async function parseKMZ(buffer: ArrayBuffer): Promise<GeoJSON.FeatureCollection> {
  const zip = await JSZip.loadAsync(buffer);
  const kmlFile = Object.keys(zip.files).find(f => f.endsWith('.kml'));
  if (!kmlFile) throw new Error('No KML file found inside KMZ archive');
  const kmlText = await zip.files[kmlFile].async('string');
  return parseKML(kmlText);
}
