'use client'

import { useState, useMemo } from 'react'
import { z } from 'zod'
import {
  calculateEndAreaVolumes,
  calculateGridVolumes,
  generateMiningReport,
  type MiningSection,
  type GridPoint,
  type VolumeResult
} from '@/lib/mining/volumeEngine'
import { exportMineSectionsToDXF, exportGridToDXF } from '@/lib/mining/minePlanDXF'
import { initialiseDXFLayers, DXF_LAYERS, TitleBlockData, TITLE_BLOCK_TEMPLATES } from '@/lib/drawing/dxfLayers'
import Drawing from 'dxf-writer'

const SectionSchema = z.object({
  station: z.number(),
  leftOffset: z.number(),
  rightOffset: z.number(),
  depth: z.number()
})

const GridPointSchema = z.object({
  easting: z.number(),
  northing: z.number(),
  groundElevation: z.number()
})

interface MiningVolumePanelProps {
  projectId?: string
  projectData?: {
    lr_number?: string
    county?: string
    district?: string
    locality?: string
  }
  surveyorProfile?: {
    fullName: string
    registrationNumber: string
    firmName: string
  } | null
}

export function MiningVolumePanel({ projectId, projectData, surveyorProfile }: MiningVolumePanelProps) {
  const [method, setMethod] = useState<'end-area' | 'grid'>('end-area')
  const [materialDensity, setMaterialDensity] = useState(1.8)
  const [materialType, setMaterialType] = useState('overburden')
  const [sections, setSections] = useState<MiningSection[]>([
    { station: 0, leftOffset: 10, rightOffset: 15, depth: 5 },
    { station: 20, leftOffset: 12, rightOffset: 18, depth: 7 },
    { station: 40, leftOffset: 15, rightOffset: 20, depth: 10 }
  ])
  const [gridPoints, setGridPoints] = useState<GridPoint[]>([])
  const [gridSpacing, setGridSpacing] = useState(10)
  const [designElevation, setDesignElevation] = useState(1000)
  const [error, setError] = useState<string | null>(null)

  const stationInterval = useMemo(() => {
    if (sections.length < 2) return 20
    const sorted = [...sections].sort((a, b) => a.station - b.station)
    return sorted[1].station - sorted[0].station
  }, [sections])

  const result: VolumeResult | null = useMemo(() => {
    try {
      setError(null)
      if (method === 'end-area') {
        if (sections.length < 2) {
          throw new Error('At least 2 sections required')
        }
        return calculateEndAreaVolumes(sections, stationInterval, materialDensity)
      } else {
        if (gridPoints.length === 0) {
          throw new Error('At least 1 grid point required')
        }
        return calculateGridVolumes(gridPoints, gridSpacing, designElevation, materialDensity)
      }
    } catch (e) {
      if (e instanceof z.ZodError) {
        setError(e.errors[0]?.message)
      } else if (e instanceof Error) {
        setError(e.message)
      }
      return null
    }
  }, [method, sections, gridPoints, stationInterval, gridSpacing, designElevation, materialDensity])

  const addSection = () => {
    const lastStation = sections.length > 0 
      ? Math.max(...sections.map(s => s.station))
      : 0
    setSections([...sections, {
      station: lastStation + 20,
      leftOffset: 10,
      rightOffset: 15,
      depth: 5
    }])
  }

  const updateSection = (index: number, field: keyof MiningSection, value: number) => {
    const newSections = [...sections]
    newSections[index] = { ...newSections[index], [field]: value }
    setSections(newSections)
  }

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index))
  }

  const exportDXF = () => {
    if (!result) return

    const tb: TitleBlockData = {
      drawingTitle: TITLE_BLOCK_TEMPLATES.mining_section.drawingTitle,
      lrNumber: projectData?.lr_number ?? 'N/A',
      county: projectData?.county ?? 'N/A',
      district: projectData?.district ?? 'N/A',
      locality: projectData?.locality ?? 'N/A',
      areaHa: 0,
      perimeterM: 0,
      surveyorName: surveyorProfile?.fullName ?? 'N/A',
      registrationNumber: surveyorProfile?.registrationNumber ?? 'N/A',
      firmName: surveyorProfile?.firmName ?? 'N/A',
      date: new Date().toLocaleDateString('en-KE'),
      submissionRef: 'N/A',
      coordinateSystem: 'Arc 1960 / UTM Zone 37S (SRID: 21037)',
      scale: '1:1000',
      sheetNumber: '1 of 1',
      revision: 'R00'
    }

    let dxf: string
    if (method === 'end-area') {
      dxf = exportMineSectionsToDXF(sections, tb)
    } else {
      dxf = exportGridToDXF(gridPoints, tb)
    }

    const blob = new Blob([dxf], { type: 'application/dxf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mine_plan_${projectId || 'export'}.dxf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const reportText = useMemo(() => {
    if (!result) return ''
    return generateMiningReport(result, {
      lrNumber: projectData?.lr_number,
      county: projectData?.county,
      mineType: materialType
    })
  }, [result, projectData, materialType])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Mining Volume Calculator</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setMethod('end-area')}
            className={`px-4 py-2 rounded ${
              method === 'end-area' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            End-Area Method
          </button>
          <button
            onClick={() => setMethod('grid')}
            className={`px-4 py-2 rounded ${
              method === 'grid' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Grid Method
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Material Type</label>
          <select
            value={materialType}
            onChange={(e) => setMaterialType(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="overburden">Overburden</option>
            <option value="ore">Ore</option>
            <option value="waste">Waste Rock</option>
            <option value="topsoil">Topsoil</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Material Density (t/m³)</label>
          <input
            type="number"
            step="0.1"
            value={materialDensity}
            onChange={(e) => setMaterialDensity(parseFloat(e.target.value) || 1.8)}
            className="w-full p-2 border rounded"
          />
        </div>
      </div>

      {method === 'end-area' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">Cross Sections</h3>
            <button
              onClick={addSection}
              className="px-3 py-1 bg-green-600 text-white rounded text-sm"
            >
              + Add Section
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 text-left">Station</th>
                  <th className="p-2 text-left">Left Offset (m)</th>
                  <th className="p-2 text-left">Right Offset (m)</th>
                  <th className="p-2 text-left">Depth (m)</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {sections.map((section, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">
                      <input
                        type="number"
                        value={section.station}
                        onChange={(e) => updateSection(idx, 'station', parseFloat(e.target.value) || 0)}
                        className="w-24 p-1 border rounded"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={section.leftOffset}
                        onChange={(e) => updateSection(idx, 'leftOffset', parseFloat(e.target.value) || 0)}
                        className="w-24 p-1 border rounded"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={section.rightOffset}
                        onChange={(e) => updateSection(idx, 'rightOffset', parseFloat(e.target.value) || 0)}
                        className="w-24 p-1 border rounded"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={section.depth}
                        onChange={(e) => updateSection(idx, 'depth', parseFloat(e.target.value) || 0)}
                        className="w-24 p-1 border rounded"
                      />
                    </td>
                    <td className="p-2">
                      <button
                        onClick={() => removeSection(idx)}
                        className="text-red-600 hover:text-red-800"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {method === 'grid' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Grid Spacing (m)</label>
              <input
                type="number"
                value={gridSpacing}
                onChange={(e) => setGridSpacing(parseFloat(e.target.value) || 10)}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Design Elevation (m)</label>
              <input
                type="number"
                value={designElevation}
                onChange={(e) => setDesignElevation(parseFloat(e.target.value) || 1000)}
                className="w-full p-2 border rounded"
              />
            </div>
          </div>
          <p className="text-sm text-gray-600">
            Import grid points from CSV or enter manually. Currently {gridPoints.length} points defined.
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded">
            <h3 className="font-medium mb-2">Volume Results</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-600">Cut Volume</div>
                <div className="text-lg font-semibold">{result.cutVolumeM3.toLocaleString()} m³</div>
              </div>
              <div>
                <div className="text-gray-600">Fill Volume</div>
                <div className="text-lg font-semibold">{result.fillVolumeM3.toLocaleString()} m³</div>
              </div>
              <div>
                <div className="text-gray-600">Net Volume</div>
                <div className={`text-lg font-semibold ${result.netVolumeM3 >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {result.netVolumeM3.toLocaleString()} m³
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm mt-4">
              <div>
                <div className="text-gray-600">Cut Tonnage</div>
                <div className="font-medium">{result.cutTonnage.toLocaleString()} t</div>
              </div>
              <div>
                <div className="text-gray-600">Fill Tonnage</div>
                <div className="font-medium">{result.fillTonnage.toLocaleString()} t</div>
              </div>
              <div>
                <div className="text-gray-600">Net Tonnage</div>
                <div className="font-medium">{result.netTonnage.toLocaleString()} t</div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={exportDXF}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Export DXF
            </button>
          </div>

          <details className="cursor-pointer">
            <summary className="font-medium">View Full Report</summary>
            <pre className="mt-2 p-4 bg-gray-50 rounded text-xs overflow-x-auto">
              {reportText}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
