'use client'

import { useState } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import Papa from 'papaparse'
import BathymetryMap from '@/components/hydrolive/BathymetryMap'
import VolumeDelta from '@/components/hydrolive/VolumeDelta'
import HazardAlert from '@/components/hydrolive/HazardAlert'
import { processBathymetry } from '@/lib/compute/bathymetry'
import type { SoundingPoint, ProcessBathymetryResponse } from '@/types/bathymetry'

export default function HydroLivePage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ProcessBathymetryResponse | null>(null)
  const [soundings, setSoundings] = useState<SoundingPoint[]>([])
  const projectId = 'default-project'
  
  const handleUpload = async (file: File) => {
    const text = await file.text()
    let parsedSoundings: SoundingPoint[]
    
    if (file.name.endsWith('.json')) {
      parsedSoundings = JSON.parse(text)
    } else {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
      parsedSoundings = parsed.data.map((row: any, i: number) => ({
        id: row.id || String(i),
        easting: parseFloat(row.easting || row.X || 0),
        northing: parseFloat(row.northing || row.Y || 0),
        depth: parseFloat(row.depth || row.Z || row.Depth || 0)
      })).filter((s: any) => !isNaN(s.depth))
    }
    
    setSoundings(parsedSoundings)
    setLoading(true)
    try {
      const res = await processBathymetry(projectId, parsedSoundings, {
        contour_interval: 1.0,
        detect_hazards: true,
        compare_previous: true
      })
      setResult(res)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">HydroLive Mapper</h1>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Upload Soundings</h2>
        
        <label className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 w-fit">
          <Upload className="h-5 w-5" />
          Upload Depth Data
          <input
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            disabled={loading}
          />
        </label>
        
        {loading && (
          <div className="mt-4 flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Processing bathymetry...</span>
          </div>
        )}
      </div>
      
      {result && (
        <div className="space-y-6">
          <BathymetryMap soundings={soundings} />
          
          {result.volume_delta && <VolumeDelta volumeDelta={result.volume_delta} />}
          
          {result.hazards.length > 0 && (
            <div className="space-y-2">
              {result.hazards.map(hazard => (
                <HazardAlert key={hazard.id} hazard={hazard} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
