'use client';
import { useState, useEffect } from 'react';
import { FieldProject } from '@/types/field';
import { listLocalProjects, deleteProjectLocally } from '@/lib/field/storage';
import { exportToCSV, exportToKML, downloadBlob } from '@/lib/field/export';
import { FolderOpen, ArrowLeft, Download, Trash2, MapPin } from 'lucide-react';
import Link from 'next/link';

export default function FieldProjectsPage() {
  const [projects, setProjects] = useState<FieldProject[]>([]);

  useEffect(() => {
    setProjects(listLocalProjects());
  }, []);

  function handleDelete(id: string) {
    if (confirm('Delete this project locally?')) {
      deleteProjectLocally(id);
      setProjects(listLocalProjects());
    }
  }

  function handleExport(p: FieldProject, format: 'csv' | 'kml') {
    if (format === 'csv') {
      const csv = exportToCSV(p);
      downloadBlob(csv, `${p.name}.csv`, 'text/csv');
    } else {
      const kml = exportToKML(p);
      downloadBlob(kml, `${p.name}.kml`, 'application/vnd.google-earth.kml+xml');
    }
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-900 text-white">
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700 z-10">
        <Link href="/field"><ArrowLeft className="w-5 h-5 text-gray-400 hover:text-white" /></Link>
        <span className="font-semibold text-sm flex-1">Field Projects (Local)</span>
      </div>

      <div className="p-4 overflow-y-auto space-y-4">
        {projects.length === 0 ? (
          <div className="text-gray-400 text-center text-sm py-10">No local projects saved. Collect beacons or walk perimeters to generate a project.</div>
        ) : (
          projects.map(p => (
            <div key={p.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleString()}</div>
                </div>
                <button onClick={() => handleDelete(p.id)} className="text-gray-500 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-4 text-sm mb-4">
                <div className="flex items-center gap-1 text-yellow-500">
                  <MapPin className="w-4 h-4" /> {p.beacons.length} beacons
                </div>
                <div className="flex items-center gap-1 text-green-500">
                  <FolderOpen className="w-4 h-4" /> {p.parcels.length} parcels
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleExport(p, 'kml')} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs font-semibold flex justify-center items-center gap-2">
                  <Download className="w-3 h-3" /> KML
                </button>
                <button onClick={() => handleExport(p, 'csv')} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs font-semibold flex justify-center items-center gap-2">
                  <Download className="w-3 h-3" /> CSV
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
