'use client';

import React, { useState, useMemo } from 'react';

export interface TemplateElement {
  id: string;
  type: 'carriageway' | 'shoulder' | 'cut_slope' | 'fill_slope' | 'ditch' | 'pavement_layer';
  side: 'left' | 'right' | 'both';
  width: number;         // metres
  slope: number;         // percentage or ratio
  depth?: number;        // metres (for ditch, pavement layer thickness)
  material?: string;     // pavement material name
  color: string;         // hex color for rendering
}

export interface PavementLayer {
  name: string;
  thickness: number;
  material: string;
  color: string;
}

export interface CrossSectionTemplate {
  name: string;
  roadClass: string;
  elements: TemplateElement[];
  pavementLayers: PavementLayer[];
  totalWidth: number;
  designSpeed?: number;
}

type DxfPoint = { x: number; y: number }

function dxfText(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '?').replace(/[\r\n]/g, ' ').slice(0, 120)
}

function buildTemplateDxf(template: CrossSectionTemplate): { content?: string; issues: string[] } {
  const issues: string[] = []
  if (template.elements.length === 0) issues.push('Add at least one cross-section element before export.')
  template.elements.forEach((element, index) => {
    if (!Number.isFinite(element.width) || element.width <= 0) issues.push(`Element ${index + 1}: width must be a finite positive value.`)
    if (!Number.isFinite(element.slope)) issues.push(`Element ${index + 1}: slope must be finite.`)
  })
  template.pavementLayers.forEach((layer, index) => {
    if (!Number.isFinite(layer.thickness) || layer.thickness <= 0) issues.push(`Pavement layer ${index + 1}: thickness must be finite and positive.`)
  })
  if (issues.length) return { issues }

  const entities: string[] = []
  const layers = new Set<string>(['XS_AXIS', 'XS_LABELS', 'XS_NOTES'])
  let leftPavementEdge: DxfPoint = { x: 0, y: 0 }
  let rightPavementEdge: DxfPoint = { x: 0, y: 0 }
  let minY = 0
  let maxY = 0

  const addLine = (a: DxfPoint, b: DxfPoint, layer: string) => {
    layers.add(layer)
    entities.push(['0', 'LINE', '8', layer, '10', String(a.x), '20', String(a.y), '30', '0', '11', String(b.x), '21', String(b.y), '31', '0'].join('\n'))
  }
  const addText = (point: DxfPoint, content: string, height = 0.16, layer = 'XS_LABELS') => {
    layers.add(layer)
    entities.push(['0', 'TEXT', '8', layer, '10', String(point.x), '20', String(point.y), '30', '0', '40', String(height), '1', dxfText(content)].join('\n'))
  }

  for (const side of ['left', 'right'] as const) {
    let current: DxfPoint = { x: 0, y: 0 }
    const applicable = template.elements.filter(element => element.side === side || element.side === 'both')
    for (const element of applicable) {
      const width = element.side === 'both' ? element.width / 2 : element.width
      const next: DxfPoint = {
        x: current.x + (side === 'left' ? -width : width),
        y: current.y + (element.slope / 100) * width,
      }
      const layer = `XS_${element.type.toUpperCase()}`
      addLine(current, next, layer)
      addText({ x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 + 0.2 }, `${element.type.replace('_', ' ')} ${width.toFixed(2)}m @ ${element.slope.toFixed(2)}%`)
      minY = Math.min(minY, next.y)
      maxY = Math.max(maxY, next.y)
      current = next
      if (element.type === 'carriageway') {
        if (side === 'left') leftPavementEdge = current
        else rightPavementEdge = current
      }
    }
  }

  const pavementWidthExists = leftPavementEdge.x < 0 && rightPavementEdge.x > 0
  if (pavementWidthExists) {
    let cumulativeDepth = 0
    template.pavementLayers.forEach((pavementLayer, index) => {
      const nextDepth = cumulativeDepth + pavementLayer.thickness
      const layer = `XS_PAVEMENT_${index + 1}`
      layers.add(layer)
      const vertices = [
        { x: leftPavementEdge.x, y: leftPavementEdge.y - cumulativeDepth },
        { x: 0, y: -cumulativeDepth },
        { x: rightPavementEdge.x, y: rightPavementEdge.y - cumulativeDepth },
        { x: rightPavementEdge.x, y: rightPavementEdge.y - nextDepth },
        { x: 0, y: -nextDepth },
        { x: leftPavementEdge.x, y: leftPavementEdge.y - nextDepth },
      ]
      const parts = ['0', 'LWPOLYLINE', '8', layer, '90', String(vertices.length), '70', '1']
      vertices.forEach(vertex => parts.push('10', String(vertex.x), '20', String(vertex.y)))
      entities.push(parts.join('\n'))
      addText({ x: Math.max(2, rightPavementEdge.x + 0.7), y: -cumulativeDepth - pavementLayer.thickness / 2 }, `${pavementLayer.name} / ${pavementLayer.material} / ${(pavementLayer.thickness * 1000).toFixed(0)}mm`, 0.14)
      cumulativeDepth = nextDepth
      minY = Math.min(minY, leftPavementEdge.y - cumulativeDepth, rightPavementEdge.y - cumulativeDepth)
    })
  }

  addLine({ x: 0, y: minY - 0.5 }, { x: 0, y: maxY + 0.5 }, 'XS_AXIS')
  const leftExtent = Math.min(0, ...template.elements.map(element => -element.width))
  addText({ x: leftExtent, y: maxY + 1.0 }, `${template.name} / Road class ${template.roadClass}`, 0.25)
  addText({ x: leftExtent, y: maxY + 0.6 }, 'Metric model space; slope values are percent; verify this schematic against approved design.', 0.14, 'XS_NOTES')

  const layerRows = Array.from(layers).map((layer, index) => ['0', 'LAYER', '2', layer, '70', '0', '62', String(index === 0 ? 7 : 3 + (index % 5)), '6', 'CONTINUOUS'].join('\n'))
  const content = [
    '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n6\n9\n$MEASUREMENT\n70\n1\n0\nENDSEC',
    `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${layers.size}\n${layerRows.join('\n')}\n0\nENDTAB\n0\nENDSEC`,
    `0\nSECTION\n2\nENTITIES\n${entities.join('\n')}\n0\nENDSEC\n0\nEOF`,
  ].join('\n')
  return { content, issues: [] }
}

const PRESETS: Record<string, CrossSectionTemplate> = {
  'Class A': {
    name: 'Class A Reference (illustrative)',
    roadClass: 'A',
    designSpeed: 60,
    totalWidth: 10,
    elements: [
      { id: 'c-l', type: 'carriageway', side: 'left', width: 3.5, slope: -2.5, color: '#4b5563' },
      { id: 'c-r', type: 'carriageway', side: 'right', width: 3.5, slope: -2.5, color: '#4b5563' },
      { id: 's-l', type: 'shoulder', side: 'left', width: 1.5, slope: -4.0, color: '#6b7280' },
      { id: 's-r', type: 'shoulder', side: 'right', width: 1.5, slope: -4.0, color: '#6b7280' },
      { id: 'f-l', type: 'fill_slope', side: 'left', width: 3.0, slope: -66.67, color: '#10b981' },
      { id: 'f-r', type: 'fill_slope', side: 'right', width: 3.0, slope: -66.67, color: '#10b981' },
    ],
    pavementLayers: [
      { name: 'Wearing Course', material: 'Asphalt Concrete', thickness: 0.05, color: '#374151' },
      { name: 'Base Course', material: 'Crushed Stone', thickness: 0.15, color: '#9ca3af' },
      { name: 'Sub-base', material: 'Gravel', thickness: 0.20, color: '#d1d5db' },
    ]
  },
  'Class B': {
    name: 'Class B Road',
    roadClass: 'B',
    designSpeed: 60,
    totalWidth: 8.5,
    elements: [
      { id: 'c-l', type: 'carriageway', side: 'left', width: 3.25, slope: -2.5, color: '#4b5563' },
      { id: 'c-r', type: 'carriageway', side: 'right', width: 3.25, slope: -2.5, color: '#4b5563' },
      { id: 's-l', type: 'shoulder', side: 'left', width: 1.0, slope: -4.0, color: '#6b7280' },
      { id: 's-r', type: 'shoulder', side: 'right', width: 1.0, slope: -4.0, color: '#6b7280' },
    ],
    pavementLayers: [
      { name: 'Wearing Course', material: 'Asphalt Concrete', thickness: 0.05, color: '#374151' },
      { name: 'Base Course', material: 'Crushed Stone', thickness: 0.15, color: '#9ca3af' },
    ]
  },
  'Class C': {
    name: 'Class C Road',
    roadClass: 'C',
    designSpeed: 50,
    totalWidth: 7.0,
    elements: [
      { id: 'c-l', type: 'carriageway', side: 'left', width: 3.0, slope: -2.5, color: '#4b5563' },
      { id: 'c-r', type: 'carriageway', side: 'right', width: 3.0, slope: -2.5, color: '#4b5563' },
      { id: 's-l', type: 'shoulder', side: 'left', width: 0.5, slope: -4.0, color: '#6b7280' },
      { id: 's-r', type: 'shoulder', side: 'right', width: 0.5, slope: -4.0, color: '#6b7280' },
    ],
    pavementLayers: [
      { name: 'Wearing Course', material: 'Double Surface Dressing', thickness: 0.03, color: '#4b5563' },
      { name: 'Base Course', material: 'Gravel', thickness: 0.15, color: '#d1d5db' },
    ]
  },
  'Urban Street': {
    name: 'Urban Street',
    roadClass: 'Urban',
    designSpeed: 50,
    totalWidth: 11.0,
    elements: [
      { id: 'c-l', type: 'carriageway', side: 'left', width: 3.5, slope: -2.5, color: '#4b5563' },
      { id: 'c-r', type: 'carriageway', side: 'right', width: 3.5, slope: -2.5, color: '#4b5563' },
      { id: 'k-l', type: 'shoulder', side: 'left', width: 0.5, slope: 20, color: '#9ca3af' }, // kerb
      { id: 'k-r', type: 'shoulder', side: 'right', width: 0.5, slope: 20, color: '#9ca3af' }, // kerb
      { id: 'sw-l', type: 'shoulder', side: 'left', width: 1.5, slope: 2.0, color: '#d1d5db' }, // sidewalk
      { id: 'sw-r', type: 'shoulder', side: 'right', width: 1.5, slope: 2.0, color: '#d1d5db' }, // sidewalk
    ],
    pavementLayers: [
      { name: 'Wearing Course', material: 'Asphalt Concrete', thickness: 0.05, color: '#374151' },
      { name: 'Base Course', material: 'Crushed Stone', thickness: 0.15, color: '#9ca3af' },
    ]
  },
  'Access Road': {
    name: 'Access Road',
    roadClass: 'Access',
    designSpeed: 30,
    totalWidth: 4.0,
    elements: [
      { id: 'c-b', type: 'carriageway', side: 'both', width: 4.0, slope: -2.5, color: '#4b5563' },
    ],
    pavementLayers: [
      { name: 'Wearing Course', material: 'Gravel', thickness: 0.15, color: '#d1d5db' },
    ]
  }
};

const generateId = () => Math.random().toString(36).substr(2, 9);

export function CrossSectionTemplateDesigner() {
  const [template, setTemplate] = useState<CrossSectionTemplate>(PRESETS['Class A']);
  const [zoom, setZoom] = useState(20); // pixels per metre
  const [exportError, setExportError] = useState('')

  const handleApplyPreset = (presetName: string) => {
    setTemplate(PRESETS[presetName]);
  };

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(template, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${template.name.replace(/\s+/g, '_')}_template.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleExportDxf = () => {
    const { content, issues } = buildTemplateDxf(template)
    if (!content || issues.length > 0) {
      setExportError(issues.join(' '))
      return
    }
    setExportError('')
    const blob = new Blob([content], { type: 'application/dxf;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const filename = template.name.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'cross_section_template'
    anchor.href = url
    anchor.download = `${filename}.dxf`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  };

  const updateElement = (id: string, updates: Partial<TemplateElement>) => {
    setTemplate(prev => ({
      ...prev,
      elements: prev.elements.map(el => el.id === id ? { ...el, ...updates } : el)
    }));
  };

  const deleteElement = (id: string) => {
    setTemplate(prev => ({
      ...prev,
      elements: prev.elements.filter(el => el.id !== id)
    }));
  };

  const addElement = (type: TemplateElement['type']) => {
    const newEl: TemplateElement = {
      id: generateId(),
      type,
      side: 'right',
      width: 2.0,
      slope: -2.0,
      color: type === 'carriageway' ? '#4b5563' : type === 'shoulder' ? '#6b7280' : '#10b981'
    };
    if (type === 'ditch') newEl.depth = 0.5;
    
    setTemplate(prev => ({
      ...prev,
      elements: [...prev.elements, newEl]
    }));
  };

  const renderSVG = () => {
    const cx = 400; // Center X in SVG
    const cy = 150; // Center Y in SVG
    
    // Sort elements: left side extends left, right side extends right
    const leftEls = template.elements.filter(e => e.side === 'left' || e.side === 'both');
    const rightEls = template.elements.filter(e => e.side === 'right' || e.side === 'both');

    let currentXLeft = cx;
    let currentYLeft = cy;
    let currentXRight = cx;
    let currentYRight = cy;

    const paths: JSX.Element[] = [];

    // Left elements (render from center outwards)
    leftEls.forEach((el, i) => {
      const widthPx = el.side === 'both' ? (el.width / 2) * zoom : el.width * zoom;
      const dropPx = (el.slope / 100) * widthPx; // assuming slope is %
      const nextX = currentXLeft - widthPx;
      const nextY = currentYLeft - dropPx; // Negative slope means down, SVG y goes down so we add dropPx if slope is negative, but slope is negative so it drops (increases Y). Wait, if slope = -2%, dropPx = -0.02 * width. So nextY = currentYLeft - (-...) = currentYLeft + ... which goes down in SVG. Correct.

      paths.push(
        <line
          key={`l-${el.id}`}
          x1={currentXLeft} y1={currentYLeft}
          x2={nextX} y2={nextY}
          stroke={el.color}
          strokeWidth="3"
        />
      );
      
      // Annotation
      paths.push(
        <text key={`l-text-${el.id}`} x={(currentXLeft + nextX)/2} y={currentYLeft - 15} fill="white" fontSize="10" textAnchor="middle">
          {el.side === 'both' ? el.width/2 : el.width}m ({el.slope}%)
        </text>
      );

      currentXLeft = nextX;
      currentYLeft = nextY;
    });

    // Right elements
    rightEls.forEach((el, i) => {
      const widthPx = el.side === 'both' ? (el.width / 2) * zoom : el.width * zoom;
      const dropPx = (el.slope / 100) * widthPx;
      const nextX = currentXRight + widthPx;
      const nextY = currentYRight - dropPx; 

      paths.push(
        <line
          key={`r-${el.id}`}
          x1={currentXRight} y1={currentYRight}
          x2={nextX} y2={nextY}
          stroke={el.color}
          strokeWidth="3"
        />
      );

      // Annotation
      paths.push(
        <text key={`r-text-${el.id}`} x={(currentXRight + nextX)/2} y={currentYRight - 15} fill="white" fontSize="10" textAnchor="middle">
          {el.side === 'both' ? el.width/2 : el.width}m ({el.slope}%)
        </text>
      );

      currentXRight = nextX;
      currentYRight = nextY;
    });

    return (
      <svg width="100%" height="300" viewBox="0 0 800 300" className="bg-gray-900 border border-gray-800 rounded">
        {/* Grid */}
        <g stroke="#374151" strokeWidth="0.5">
          {Array.from({ length: 17 }).map((_, i) => (
            <line key={`v-${i}`} x1={i * 50} y1={0} x2={i * 50} y2={300} />
          ))}
          {Array.from({ length: 7 }).map((_, i) => (
            <line key={`h-${i}`} x1={0} y1={i * 50} x2={800} y2={i * 50} />
          ))}
        </g>
        
        {/* Centerline */}
        <line x1={cx} y1={0} x2={cx} y2={300} stroke="#f87171" strokeWidth="1" strokeDasharray="5,5" />
        <text x={cx + 5} y={20} fill="#f87171" fontSize="12">CL</text>

        {paths}
      </svg>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 p-4 text-white">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Cross Section Template Designer</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExportJson} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm">Export JSON</button>
          <button onClick={handleExportDxf} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">Export DXF</button>
        </div>
      </div>
      {exportError && <p role="alert" className="mb-3 rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">{exportError}</p>}
      <p className="mb-4 text-xs text-gray-500">Reference presets are illustrative starting points. Verify widths, slopes and pavement layers against the approved project design and current governing documents.</p>

      <div className="flex flex-1 flex-col gap-4 overflow-visible lg:flex-row lg:overflow-hidden">
        {/* Sidebar - Presets & Elements */}
        <div className="flex w-full flex-col gap-4 lg:w-80 lg:overflow-y-auto lg:pr-2">
          <div className="bg-gray-900 p-4 rounded border border-gray-800">
            <h2 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wider">Reference presets</h2>
            <div className="flex flex-wrap gap-2">
              {Object.keys(PRESETS).map(preset => (
                <button
                  key={preset}
                  onClick={() => handleApplyPreset(preset)}
                  className={`px-2 py-1 text-xs rounded border ${template.name === PRESETS[preset].name ? 'bg-blue-900 border-blue-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 p-4 rounded border border-gray-800 flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Elements</h2>
              <div className="relative group">
                <button className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-xs rounded border border-gray-700">
                  + Add
                </button>
                <div className="absolute right-0 top-full mt-1 w-32 bg-gray-800 border border-gray-700 rounded shadow-xl hidden group-hover:block z-10">
                  {['carriageway', 'shoulder', 'cut_slope', 'fill_slope', 'ditch'].map(type => (
                    <button
                      key={type}
                      onClick={() => addElement(type as any)}
                      className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-700 capitalize"
                    >
                      {type.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2 overflow-y-auto">
              {template.elements.map(el => (
                <div key={el.id} className="bg-gray-800 p-2 rounded border border-gray-700 text-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium capitalize text-gray-300">{el.type.replace('_', ' ')}</span>
                    <button onClick={() => deleteElement(el.id)} className="text-red-400 hover:text-red-300 text-xs">Del</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-gray-500 block mb-1">Side</label>
                      <select 
                        value={el.side} 
                        onChange={(e) => updateElement(el.id, { side: e.target.value as any })}
                        className="w-full bg-gray-950 border border-gray-700 rounded p-1"
                      >
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                        <option value="both">Both</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-gray-500 block mb-1">Width (m)</label>
                      <input 
                        type="number" step="0.1"
                        value={el.width}
                        onChange={(e) => updateElement(el.id, { width: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-gray-950 border border-gray-700 rounded p-1"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 block mb-1">Slope (%)</label>
                      <input 
                        type="number" step="0.1"
                        value={el.slope}
                        onChange={(e) => updateElement(el.id, { slope: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-gray-950 border border-gray-700 rounded p-1"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Canvas Area */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded p-2 relative min-h-80 flex-1">
            <div className="absolute top-4 right-4 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs z-10 flex gap-2 items-center">
              <span>Zoom:</span>
              <button onClick={() => setZoom(z => Math.max(5, z - 5))} className="px-1 bg-gray-700 rounded hover:bg-gray-600">-</button>
              <span>{zoom}px/m</span>
              <button onClick={() => setZoom(z => Math.min(100, z + 5))} className="px-1 bg-gray-700 rounded hover:bg-gray-600">+</button>
            </div>
            {renderSVG()}
          </div>

          {/* Pavement Layers Bottom Panel */}
          <div className="bg-gray-900 border border-gray-800 rounded p-4 h-auto min-h-48 flex flex-col gap-6 lg:h-48 lg:flex-row">
            <div className="w-full border-b border-gray-800 pb-4 lg:w-1/3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4 overflow-y-auto">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Pavement Layers</h2>
              <div className="space-y-1">
                {template.pavementLayers.map((layer, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs p-1 rounded bg-gray-800">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: layer.color }}></div>
                      <span>{layer.name}</span>
                    </div>
                    <span className="text-gray-400">{layer.thickness * 1000}mm</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-center px-8">
              <h3 className="text-xs text-gray-500 mb-2 text-center">Visual Stack</h3>
              <div className="w-full max-w-md mx-auto border-x border-b border-gray-700 flex flex-col-reverse shadow-lg">
                <div className="h-4 w-full bg-orange-900/40 border-t border-orange-900/60 relative group">
                   <span className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400 opacity-50">Subgrade</span>
                </div>
                {template.pavementLayers.map((layer, idx) => (
                  <div 
                    key={idx} 
                    className="w-full flex items-center justify-center relative group transition-all"
                    style={{ 
                      height: `${Math.max(20, layer.thickness * 150)}px`,
                      backgroundColor: layer.color,
                      opacity: 0.9
                    }}
                  >
                    <span className="text-[10px] text-white mix-blend-difference font-medium drop-shadow-md">{layer.material} ({layer.thickness * 1000}mm)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
