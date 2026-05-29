'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { MapLayer, GeoPDFLayer, MBTilesSession } from '@/types/field';
import { parseKML, parseKMZ } from '@/lib/field/kml';
import { uploadMBTiles } from '@/lib/field/mbtiles';
import { Upload, Eye, EyeOff, FileText, Database, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const MapViewer = dynamic(() => import('@/components/field/MapViewer'), { ssr: false });

// GeoPDFImport rendered in a slide-up panel — NOT dynamic (no window deps)
import GeoPDFImport from '@/components/field/GeoPDFImport';

export default function MapPage() {
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const [geoPDFLayers, setGeoPDFLayers] = useState<GeoPDFLayer[]>([]);
  const [mbtilesSessions, setMBTilesSessions] = useState<MBTilesSession[]>([]);
  const [panel, setPanel] = useState<'none' | 'geopdf' | 'mbtiles'>('none');
  const [mbtilesLoading, setMBTilesLoading] = useState(false);

  async function handleKMLKMZ(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    try {
      let geojson: GeoJSON.FeatureCollection;
      if (ext === 'kml') geojson = await parseKML(await file.text());
      else if (ext === 'kmz') geojson = await parseKMZ(await file.arrayBuffer());
      else { alert('Import KML or KMZ files.'); return; }
      setLayers(prev => [...prev, {
        id: `layer_${Date.now()}`, name: file.name,
        type: ext as 'kml' | 'kmz', geojson, visible: true, loadedAt: Date.now(),
      }]);
    } catch (err) { alert(`Parse error: ${(err as Error).message}`); }
  }

  async function handleMBTiles(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMBTilesLoading(true);
    try {
      const session = await uploadMBTiles(file);
      setMBTilesSessions(prev => [...prev, session]);
    } catch (err) { alert(`MBTiles error: ${(err as Error).message}`); }
    finally { setMBTilesLoading(false); }
  }

  function toggleLayer(id: string) {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-900 text-white">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700 flex-wrap">
        <Link href="/field"><ArrowLeft className="w-5 h-5 text-gray-400" /></Link>
        <span className="font-semibold text-sm flex-1">Map Viewer</span>

        {/* KML/KMZ */}
        <label className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs px-2.5 py-1.5 rounded-lg cursor-pointer">
          <Upload className="w-3.5 h-3.5" /> KML/KMZ
          <input type="file" accept=".kml,.kmz" className="hidden" onChange={handleKMLKMZ} />
        </label>

        {/* MBTiles */}
        <label className={`flex items-center gap-1.5 text-white text-xs px-2.5 py-1.5 rounded-lg cursor-pointer
          ${mbtilesLoading ? 'bg-orange-800' : 'bg-orange-600 hover:bg-orange-500'}`}>
          <Database className="w-3.5 h-3.5" />
          {mbtilesLoading ? 'Uploading…' : 'MBTiles'}
          <input type="file" accept=".mbtiles" className="hidden" onChange={handleMBTiles} disabled={mbtilesLoading} />
        </label>

        {/* GeoPDF */}
        <button onClick={() => setPanel(p => p === 'geopdf' ? 'none' : 'geopdf')}
          className="flex items-center gap-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs px-2.5 py-1.5 rounded-lg">
          <FileText className="w-3.5 h-3.5" /> GeoPDF
        </button>
      </div>

      {/* Layer chips */}
      {(layers.length > 0 || mbtilesSessions.length > 0 || geoPDFLayers.length > 0) && (
        <div className="flex gap-2 px-3 py-1.5 bg-gray-900 border-b border-gray-700 overflow-x-auto">
          {layers.map(l => (
            <button key={l.id} onClick={() => toggleLayer(l.id)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border whitespace-nowrap
                ${l.visible ? 'border-blue-500 text-blue-400' : 'border-gray-600 text-gray-500'}`}>
              {l.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {l.name}
            </button>
          ))}
          {mbtilesSessions.map(s => (
            <span key={s.key} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-orange-500 text-orange-400 whitespace-nowrap">
              <Database className="w-3 h-3" />{s.name}
            </span>
          ))}
          {geoPDFLayers.map(g => (
            <span key={g.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-purple-500 text-purple-400 whitespace-nowrap">
              <FileText className="w-3 h-3" />{g.name}
            </span>
          ))}
        </div>
      )}

      {/* GeoPDF panel — slide in from bottom */}
      {panel === 'geopdf' && (
        <div className="bg-gray-900 border-b border-gray-700">
          <GeoPDFImport onLayerReady={layer => {
            setGeoPDFLayers(prev => [...prev, layer]);
            setPanel('none');
          }} />
        </div>
      )}

      {/* Map */}
      <div className="flex-1 relative">
        <MapViewer
          layers={layers}
          beacons={[]}
          parcels={[]}
          geoPDFLayers={geoPDFLayers}
          mbtilesSessions={mbtilesSessions}
        />
      </div>
    </div>
  );
}
