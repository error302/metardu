'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { MapLayer } from '@/types/field';
import { parseKML, parseKMZ } from '@/lib/field/kml';
import { Upload, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const MapViewer = dynamic(() => import('@/components/field/MapViewer'), { ssr: false });

export default function MapPage() {
  const [layers, setLayers] = useState<MapLayer[]>([]);

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name;
    const ext = name.split('.').pop()?.toLowerCase();

    try {
      let geojson: GeoJSON.FeatureCollection;
      if (ext === 'kml') {
        const text = await file.text();
        geojson = await parseKML(text);
      } else if (ext === 'kmz') {
        const buffer = await file.arrayBuffer();
        geojson = await parseKMZ(buffer);
      } else {
        alert('Unsupported format. Import KML or KMZ files.');
        return;
      }
      const layer: MapLayer = {
        id: `layer_${Date.now()}`,
        name,
        type: ext as 'kml' | 'kmz',
        geojson,
        visible: true,
        loadedAt: Date.now(),
      };
      setLayers(prev => [...prev, layer]);
    } catch (err) {
      alert(`Failed to parse ${name}: ${(err as Error).message}`);
    }
  }

  function toggleLayer(id: string) {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-900 text-white">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700 z-10">
        <Link href="/field" className="text-gray-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <span className="font-semibold text-sm flex-1">Map Viewer</span>
        <label className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black font-semibold text-sm px-3 py-1.5 rounded cursor-pointer">
          <Upload className="w-4 h-4" />
          Import KML/KMZ
          <input type="file" accept=".kml,.kmz" className="hidden" onChange={handleFileImport} />
        </label>
      </div>

      {/* Layer panel */}
      {layers.length > 0 && (
        <div className="flex gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700 overflow-x-auto z-10">
          {layers.map(l => (
            <button key={l.id} onClick={() => toggleLayer(l.id)}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border whitespace-nowrap transition
                ${l.visible ? 'border-blue-500 text-blue-400' : 'border-gray-600 text-gray-500'}`}>
              {l.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {l.name}
            </button>
          ))}
        </div>
      )}

      {/* Map */}
      <div className="flex-1 relative">
        <MapViewer layers={layers} beacons={[]} parcels={[]} />
      </div>
    </div>
  );
}
