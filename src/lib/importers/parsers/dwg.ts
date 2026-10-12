/**
 * DWG Import Module
 * 
 * Since DWG is a proprietary binary format owned by Autodesk,
 * direct client-side parsing is not feasible. This module provides
 * transparent server-side conversion using one of:
 *   1. ODA File Converter (Open Design Alliance)
 *   2. LibreDWG (GNU/LGPL)
 *   3. QCAD dwg2dxf
 * 
 * The user uploads a .dwg file, we send it to the server for
 * conversion, and receive a .dxf file back for parsing.
 */

export async function isDWGFile(file: File): Promise<boolean> {
  if (file.size < 4) return false;
  const buffer = await file.slice(0, 4).arrayBuffer();
  const magic = new TextDecoder().decode(buffer);
  return magic === 'AC10';
}

/**
 * Convert a DWG file to DXF via server-side processing.
 * Returns the DXF content as a string.
 * Throws if conversion fails or server endpoint is unavailable.
 */
export async function convertDWGtoDXF(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/compute/dwg-convert', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to convert DWG: ${response.statusText}. ${errorText}`);
  }

  return response.text();
}

/**
 * Import a DWG file by converting to DXF and parsing.
 * This is the main entry point for DWG import.
 */
export async function importDWG(file: File): Promise<{
  entities: Array<{ type: string; layer: string; points?: Array<{x: number; y: number; z?: number}> }>
  layers: string[]
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}> {
  const dxfContent = await convertDWGtoDXF(file);
  
  // Basic DXF parser for points and simple entities
  const lines = dxfContent.split(/\r?\n/).map(l => l.trim());
  const entities: Array<{ type: string; layer: string; points?: Array<{x: number; y: number; z?: number}> }> = [];
  const layerSet = new Set<string>();
  
  let bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  
  let i = 0;
  while (i < lines.length) {
    if (lines[i] === '0') {
      const type = lines[i + 1];
      if (['POINT', 'LINE', 'POLYLINE', 'LWPOLYLINE'].includes(type)) {
        let layer = '0';
        let x: number | undefined, y: number | undefined, z: number | undefined;
        let points: Array<{x: number; y: number; z?: number}> = [];
        
        i += 2;
        while (i < lines.length && lines[i] !== '0') {
          const code = lines[i];
          const value = lines[i + 1];
          if (code === '8') {
            layer = value;
            layerSet.add(layer);
          } else if (code === '10') x = parseFloat(value);
          else if (code === '20') y = parseFloat(value);
          else if (code === '30') z = parseFloat(value);
          
          // Polyline parsing is simplified here; normally vertex entities follow
          // But for POINT/LINE we can capture the initial coordinate
          i += 2;
        }
        
        if (x !== undefined && y !== undefined) {
          points.push({ x, y, z });
          bounds.minX = Math.min(bounds.minX, x);
          bounds.maxX = Math.max(bounds.maxX, x);
          bounds.minY = Math.min(bounds.minY, y);
          bounds.maxY = Math.max(bounds.maxY, y);
        }
        
        entities.push({ type, layer, points });
        continue; // skip the i++ because we already advanced past the entity
      }
    }
    i++;
  }

  // Handle case with no coordinates found
  if (bounds.minX === Infinity) {
    bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  return {
    entities,
    layers: Array.from(layerSet),
    bounds
  };
}
