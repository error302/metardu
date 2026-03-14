import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface ReportOptions {
  project: {
    name: string
    location: string
    utm_zone: number
    hemisphere: string
    created_at: string
    survey_type?: string
    client_name?: string | null
    surveyor_name?: string | null
  }
  points: Array<{
    name: string
    easting: number
    northing: number
    elevation: number
    is_control: boolean
  }>
  traverse?: {
    legs: Array<{
      fromName: string
      toName: string
      distance: number
      rawBearing: number
      rawDeltaE: number
      rawDeltaN: number
      adjustedDeltaE: number
      adjustedDeltaN: number
    }>
    closingErrorE: number
    closingErrorN: number
    linearError: number
    precisionRatio: number
    precisionGrade: string
    totalDistance: number
  }
  area?: {
    squareMeters: number
    hectares: number
    acres: number
    perimeter: number
  }
}

export function generateSurveyReport(options: ReportOptions, onBlob?: (blob: Blob, filename: string) => void): void {
  const { project, points, traverse, area } = options
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  
  const amber = [232, 132, 26] as [number, number, number]
  const dark = [15, 15, 20] as [number, number, number]
  const white = [255, 255, 255] as [number, number, number]
  const gray = [200, 200, 200] as [number, number, number]

  doc.setFillColor(...dark)
  doc.rect(0, 0, 210, 35, 'F')
  
  doc.setTextColor(...amber)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('GEONOVA', 15, 15)
  
  doc.setTextColor(...white)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Professional Surveying Platform', 15, 22)
  
  doc.setFontSize(9)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB', { 
    day: '2-digit', month: 'long', year: 'numeric' 
  })}`, 15, 29)

  doc.setTextColor(...dark)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(project.name.toUpperCase(), 15, 48)
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text(`Location: ${project.location}`, 15, 55)
  doc.text(`UTM Zone: ${project.utm_zone}${project.hemisphere}`, 15, 61)
  doc.text(`Datum: WGS84`, 15, 67)
  
  let yPos = 75
  if (project.client_name || project.surveyor_name || project.survey_type) {
    doc.setFontSize(8)
    if (project.client_name) {
      doc.text(`Client: ${project.client_name}`, 15, yPos)
      yPos += 5
    }
    if (project.surveyor_name) {
      doc.text(`Surveyor: ${project.surveyor_name}`, 15, yPos)
      yPos += 5
    }
    if (project.survey_type) {
      doc.text(`Survey Type: ${project.survey_type}`, 15, yPos)
      yPos += 5
    }
  }

  doc.setDrawColor(...amber)
  doc.setLineWidth(0.8)
  doc.line(15, yPos, 195, yPos)

  yPos += 8

  doc.setTextColor(...dark)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('SURVEY COORDINATES', 15, yPos)
  yPos += 6

  autoTable(doc, {
    startY: yPos,
    head: [['Point', 'Easting (m)', 'Northing (m)', 'Elevation (m)', 'Type']],
    body: points.map(p => [
      p.name,
      p.easting.toFixed(4),
      p.northing.toFixed(4),
      p.elevation.toFixed(3),
      p.is_control ? 'Control' : 'Survey'
    ]),
    headStyles: {
      fillColor: dark,
      textColor: amber,
      fontStyle: 'bold',
      fontSize: 9
    },
    bodyStyles: { fontSize: 8, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'center' }
    },
    margin: { left: 15, right: 15 }
  })

  yPos = (doc as any).lastAutoTable.finalY + 12

  if (traverse) {
    if (yPos > 230) { doc.addPage(); yPos = 20 }

    doc.setTextColor(...dark)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('TRAVERSE ADJUSTMENT — BOWDITCH METHOD', 15, yPos)
    yPos += 6

    autoTable(doc, {
      startY: yPos,
      head: [['Line', 'Dist (m)', 'Bearing', 'ΔN Raw', 'ΔE Raw', 'Corr N', 'Corr E', 'Adj ΔN', 'Adj ΔE']],
      body: traverse.legs.map(l => {
        const deg = Math.floor(l.rawBearing)
        const min = Math.floor((l.rawBearing - deg) * 60)
        const sec = (((l.rawBearing - deg) * 60) - min) * 60
        return [
          `${l.fromName}→${l.toName}`,
          l.distance.toFixed(3),
          `${deg}°${min}'${sec.toFixed(1)}"`,
          l.rawDeltaN.toFixed(4),
          l.rawDeltaE.toFixed(4),
          (l.adjustedDeltaN - l.rawDeltaN).toFixed(4),
          (l.adjustedDeltaE - l.rawDeltaE).toFixed(4),
          l.adjustedDeltaN.toFixed(4),
          l.adjustedDeltaE.toFixed(4)
        ]
      }),
      headStyles: {
        fillColor: dark,
        textColor: amber,
        fontStyle: 'bold',
        fontSize: 7
      },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 15, right: 15 }
    })

    yPos = (doc as any).lastAutoTable.finalY + 8

    doc.setFillColor(245, 245, 245)
    doc.rect(15, yPos, 180, 32, 'F')
    doc.setDrawColor(...amber)
    doc.rect(15, yPos, 180, 32, 'S')

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 30, 30)
    doc.text(`Total Distance: ${traverse.totalDistance.toFixed(3)} m`, 20, yPos + 7)
    doc.text(`Closing Error E: ${traverse.closingErrorE.toFixed(4)} m`, 20, yPos + 13)
    doc.text(`Closing Error N: ${traverse.closingErrorN.toFixed(4)} m`, 20, yPos + 19)
    doc.text(`Linear Misclosure: ${traverse.linearError.toFixed(4)} m`, 20, yPos + 25)
    
    doc.setFont('helvetica', 'bold')
    doc.text(`Precision Ratio: 1 : ${Math.round(traverse.precisionRatio).toLocaleString()}`, 110, yPos + 13)
    
    const gradeColor = traverse.precisionGrade === 'excellent' || traverse.precisionGrade === 'good' 
      ? [0, 150, 0] : [200, 0, 0]
    doc.setTextColor(...gradeColor as [number, number, number])
    doc.setFontSize(10)
    doc.text(`Grade: ${traverse.precisionGrade.toUpperCase()}`, 110, yPos + 22)
    
    yPos += 42
  }

  if (area) {
    if (yPos > 240) { doc.addPage(); yPos = 20 }

    doc.setTextColor(...dark)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('PARCEL AREA COMPUTATION', 15, yPos)
    yPos += 8

    doc.setFillColor(245, 245, 245)
    doc.rect(15, yPos, 180, 28, 'F')
    doc.setDrawColor(...amber)
    doc.rect(15, yPos, 180, 28, 'S')

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 30, 30)
    doc.text(`Area: ${area.squareMeters.toFixed(4)} m²`, 20, yPos + 8)
    doc.text(`Area: ${area.hectares.toFixed(6)} ha`, 20, yPos + 15)
    doc.text(`Area: ${area.acres.toFixed(4)} acres`, 20, yPos + 22)
    doc.setFont('helvetica', 'bold')
    doc.text(`Perimeter: ${area.perimeter.toFixed(4)} m`, 110, yPos + 15)
    yPos += 36
  }

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFillColor(...dark)
    doc.rect(0, 282, 210, 15, 'F')
    doc.setTextColor(...gray)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text('Generated by GeoNova — Professional Surveying Platform', 15, 290)
    doc.text(`Page ${i} of ${pageCount}`, 185, 290, { align: 'right' })
  }

  const date = new Date().toISOString().slice(0, 10)
  const filename = `${project.name.replace(/\s+/g, '_')}_${date}_Survey_Report.pdf`
  
  if (onBlob) {
    const blob = doc.output('blob')
    onBlob(blob, filename)
  }
  
  doc.save(filename)
}

interface SurveyPlanOptions {
  project: {
    name: string
    location: string
    utm_zone: number
    hemisphere: string
    created_at: string
  }
  points: Array<{
    name: string
    easting: number
    northing: number
    elevation?: number | null
    is_control: boolean
    control_order?: string
  }>
  parcel?: {
    name: string
    boundary_points: Array<{ name: string; easting: number; northing: number }>
    area_sqm: number
    area_ha: number
    area_acres: number
    perimeter_m: number
  } | null
  traverse?: {
    legs: Array<{ fromName: string; toName: string; distance: number; bearing: number }>
  }
}

export function generateSurveyPlan(options: SurveyPlanOptions, onBlob?: (blob: Blob, filename: string) => void): void {
  const { project, points, parcel, traverse } = options
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  
  const amber = [232, 132, 26] as [number, number, number]
  const dark = [15, 15, 20] as [number, number, number]
  const white = [255, 255, 255] as [number, number, number]
  const gray = [120, 120, 120] as [number, number, number]
  const lightGray = [230, 230, 230] as [number, number, number]

  const scale = calculateScale(points, 180, 110)
  const bounds = getBounds(points)
  const offset = { x: 45, y: 25 }

  doc.setFillColor(...dark)
  doc.rect(0, 0, 297, 20, 'F')
  
  doc.setTextColor(...amber)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('GEONOVA', 10, 14)
  
  doc.setTextColor(...white)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('SURVEY PLAN', 60, 14)

  doc.setTextColor(...dark)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(project.name.toUpperCase(), 10, 32)
  
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text(`Location: ${project.location || 'N/A'}`, 10, 38)
  doc.text(`UTM Zone: ${project.utm_zone}${project.hemisphere}`, 10, 43)
  doc.text(`Datum: WGS84`, 80, 38)
  doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 80, 43)
  doc.text(`Scale: 1:${scale.toLocaleString()}`, 160, 38)

  doc.setDrawColor(...amber)
  doc.setLineWidth(0.5)
  doc.line(10, 47, 287, 47)

  drawGrid(doc, bounds, scale, offset, gray, lightGray)
  drawNorthArrow(doc, 265, 35)
  drawScaleBar(doc, 220, 115, scale)

  const pointMap = new Map(points.map(p => [p.name, p]))
  
  if (parcel?.boundary_points) {
    drawParcelBoundary(doc, parcel.boundary_points, bounds, scale, offset, amber)
    drawParcelLabels(doc, parcel.boundary_points, bounds, scale, offset)
  } else if (traverse?.legs) {
    drawTraverseLines(doc, traverse.legs, pointMap, bounds, scale, offset, amber)
  }

  drawPoints(doc, points, bounds, scale, offset, amber, dark)

  const tableStartY = 125
  doc.setFillColor(...dark)
  doc.rect(10, tableStartY, 277, 8, 'F')
  doc.setTextColor(...amber)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('COORDINATE LIST', 12, tableStartY + 5.5)

  autoTable(doc, {
    startY: tableStartY + 10,
    head: [['Point', 'Easting (m)', 'Northing (m)', 'Elevation (m)', 'Type']],
    body: points.map(p => [
      p.name,
      p.easting.toFixed(4),
      p.northing.toFixed(4),
      p.elevation?.toFixed(3) || '—',
      p.is_control ? (p.control_order === 'primary' ? 'Primary Control' : p.control_order === 'secondary' ? 'Secondary Control' : 'Control') : 'Survey Point'
    ]),
    headStyles: {
      fillColor: dark,
      textColor: amber,
      fontStyle: 'bold',
      fontSize: 8
    },
    bodyStyles: { fontSize: 7, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 15 },
      1: { halign: 'right', cellWidth: 35 },
      2: { halign: 'right', cellWidth: 35 },
      3: { halign: 'right', cellWidth: 25 },
      4: { halign: 'center', cellWidth: 35 }
    },
    margin: { left: 10, right: 10 },
    theme: 'grid'
  })

  if (parcel && parcel.boundary_points.length > 0) {
    let yPos = (doc as any).lastAutoTable.finalY + 10
    
    if (yPos > 160) {
      doc.addPage()
      yPos = 20
    }

    doc.setFillColor(...dark)
    doc.rect(10, yPos, 277, 8, 'F')
    doc.setTextColor(...amber)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('PARCEL COMPUTATION', 12, yPos + 5.5)

    const lines: string[][] = []
    for (let i = 0; i < parcel.boundary_points.length; i++) {
      const from = parcel.boundary_points[i]
      const to = parcel.boundary_points[(i + 1) % parcel.boundary_points.length]
      const db = distanceBearingSimple(from, to)
      lines.push([
        `${from.name} → ${to.name}`,
        db.bearing,
        `${db.distance.toFixed(3)} m`
      ])
    }

    autoTable(doc, {
      startY: yPos + 10,
      head: [['Line', 'Bearing', 'Distance']],
      body: lines,
      headStyles: {
        fillColor: dark,
        textColor: amber,
        fontStyle: 'bold',
        fontSize: 8
      },
      bodyStyles: { fontSize: 7, textColor: [30, 30, 30] },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'center' },
        2: { halign: 'right' }
      },
      margin: { left: 10, right: 10 },
      theme: 'grid'
    })

    yPos = (doc as any).lastAutoTable.finalY + 8
    doc.setFillColor(248, 248, 248)
    doc.rect(10, yPos, 277, 20, 'F')
    doc.setDrawColor(...amber)
    doc.rect(10, yPos, 277, 20, 'S')
    
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text(`Area: ${parcel.area_sqm.toFixed(4)} m²`, 15, yPos + 8)
    doc.text(`${parcel.area_ha.toFixed(6)} ha`, 100, yPos + 8)
    doc.text(`${parcel.area_acres.toFixed(4)} acres`, 160, yPos + 8)
    doc.text(`Perimeter: ${parcel.perimeter_m.toFixed(3)} m`, 15, yPos + 16)
  }

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFillColor(...dark)
    doc.rect(0, 180, 297, 12, 'F')
    doc.setTextColor(...gray)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text('Generated by GeoNova — Professional Surveying Platform', 10, 186)
    doc.text(`Page ${i} of ${pageCount}`, 280, 186, { align: 'right' })
  }

  const filename = `${project.name.replace(/\s+/g, '_')}_Survey_Plan.pdf`
  
  if (onBlob) {
    const blob = doc.output('blob')
    onBlob(blob, filename)
  }
  
  doc.save(filename)
}

function calculateScale(points: { easting: number; northing: number }[], drawingWidth: number, drawingHeight: number): number {
  if (points.length === 0) return 1000
  
  const bounds = getBounds(points)
  const rangeE = bounds.maxE - bounds.minE
  const rangeN = bounds.maxN - bounds.minN
  
  if (rangeE === 0 && rangeN === 0) return 1000
  
  const scaleX = rangeE / drawingWidth
  const scaleY = rangeN / drawingHeight
  const rawScale = Math.max(scaleX, scaleY) * 1.2
  
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawScale)))
  const normalized = rawScale / magnitude
  
  let rounded: number
  if (normalized <= 1) rounded = 1
  else if (normalized <= 2) rounded = 2
  else if (normalized <= 2.5) rounded = 2.5
  else if (normalized <= 5) rounded = 5
  else rounded = 10
  
  return rounded * magnitude
}

function getBounds(points: { easting: number; northing: number }[]) {
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity
  for (const p of points) {
    minE = Math.min(minE, p.easting)
    maxE = Math.max(maxE, p.easting)
    minN = Math.min(minN, p.northing)
    maxN = Math.max(maxN, p.northing)
  }
  return { minE, maxE, minN, maxN }
}

function drawGrid(doc: any, bounds: { minE: number; maxE: number; minN: number; maxN: number }, scale: number, offset: { x: number; y: number }, gray: [number, number, number], lightGray: [number, number, number]) {
  doc.setDrawColor(...lightGray)
  doc.setLineWidth(0.1)
  
  const rangeE = bounds.maxE - bounds.minE || 100
  const rangeN = bounds.maxN - bounds.minN || 100
  const gridStepE = Math.pow(10, Math.floor(Math.log10(rangeE / 5)))
  const gridStepN = Math.pow(10, Math.floor(Math.log10(rangeN / 5)))
  
  const startE = Math.floor(bounds.minE / gridStepE) * gridStepE
  const startN = Math.floor(bounds.minN / gridStepN) * gridStepN
  
  for (let e = startE; e <= bounds.maxE; e += gridStepE) {
    const x = offset.x + ((e - bounds.minE) / rangeE) * 180
    doc.line(x, offset.y, x, offset.y + 110)
  }
  
  for (let n = startN; n <= bounds.maxN; n += gridStepN) {
    const y = offset.y + 110 - ((n - bounds.minN) / rangeN) * 110
    doc.line(offset.x, y, offset.x + 180, y)
  }
}

function drawNorthArrow(doc: any, x: number, y: number) {
  doc.setFillColor(232, 132, 26)
  doc.setTextColor(232, 132, 26)
  doc.setFontSize(20)
  doc.text('N', x, y)
  
  doc.setDrawColor(232, 132, 26)
  doc.setLineWidth(0.8)
  doc.line(x + 3, y - 8, x + 3, y + 10)
  doc.line(x + 3, y - 8, x, y - 2)
  doc.line(x + 3, y - 8, x + 6, y - 2)
}

function drawScaleBar(doc: any, x: number, y: number, scale: number) {
  const barLength = 50
  const realLength = barLength * scale
  
  doc.setDrawColor(50, 50, 50)
  doc.setLineWidth(0.5)
  doc.line(x, y, x + barLength, y)
  doc.line(x, y - 2, x, y + 2)
  doc.line(x + barLength, y - 2, x + barLength, y + 2)
  
  doc.setFontSize(7)
  doc.setTextColor(50, 50, 50)
  doc.text(`${formatScaleDistance(realLength)}`, x + barLength / 2, y - 3, { align: 'center' })
  doc.text(`1:${scale.toLocaleString()}`, x + barLength / 2, y + 7, { align: 'center' })
}

function formatScaleDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${meters.toFixed(0)} m`
}

function drawPoints(doc: any, points: { name: string; easting: number; northing: number; is_control: boolean }[], bounds: { minE: number; maxE: number; minN: number; maxN: number }, scale: number, offset: { x: number; y: number }, amber: [number, number, number], dark: [number, number, number]) {
  const rangeE = bounds.maxE - bounds.minE || 1
  const rangeN = bounds.maxN - bounds.minN || 1
  
  for (const p of points) {
    const x = offset.x + ((p.easting - bounds.minE) / rangeE) * 180
    const y = offset.y + 110 - ((p.northing - bounds.minN) / rangeN) * 110
    
    if (x < offset.x || x > offset.x + 180 || y < offset.y || y > offset.y + 110) continue
    
    doc.setFillColor(...(p.is_control ? amber : [100, 100, 100]))
    doc.circle(x, y, p.is_control ? 2.5 : 1.5, 'F')
    
    doc.setFontSize(6)
    doc.setTextColor(30, 30, 30)
    doc.text(p.name, x + 3, y - 3)
  }
}

function drawParcelBoundary(doc: any, boundaryPoints: { name: string; easting: number; northing: number }[], bounds: { minE: number; maxE: number; minN: number; maxN: number }, scale: number, offset: { x: number; y: number }, amber: [number, number, number]) {
  const rangeE = bounds.maxE - bounds.minE || 1
  const rangeN = bounds.maxN - bounds.minN || 1
  
  doc.setDrawColor(...amber)
  doc.setLineWidth(0.8)
  
  const coords = boundaryPoints.map(p => ({
    x: offset.x + ((p.easting - bounds.minE) / rangeE) * 180,
    y: offset.y + 110 - ((p.northing - bounds.minN) / rangeN) * 110
  }))
  
  for (let i = 0; i < coords.length; i++) {
    const next = coords[(i + 1) % coords.length]
    doc.line(coords[i].x, coords[i].y, next.x, next.y)
  }
}

function drawParcelLabels(doc: any, boundaryPoints: { name: string; easting: number; northing: number }[], bounds: { minE: number; maxE: number; minN: number; maxN: number }, scale: number, offset: { x: number; y: number }) {
  const rangeE = bounds.maxE - bounds.minE || 1
  const rangeN = bounds.maxN - bounds.minN || 1
  
  for (let i = 0; i < boundaryPoints.length; i++) {
    const from = boundaryPoints[i]
    const to = boundaryPoints[(i + 1) % boundaryPoints.length]
    
    const x1 = offset.x + ((from.easting - bounds.minE) / rangeE) * 180
    const y1 = offset.y + 110 - ((from.northing - bounds.minN) / rangeN) * 110
    const x2 = offset.x + ((to.easting - bounds.minE) / rangeE) * 180
    const y2 = offset.y + 110 - ((to.northing - bounds.minN) / rangeN) * 110
    
    const midX = (x1 + x2) / 2
    const midY = (y1 + y2) / 2
    
    const db = distanceBearingSimple(from, to)
    
    doc.setFontSize(5)
    doc.setTextColor(80, 80, 80)
    doc.text(`${db.bearing} / ${db.distance.toFixed(2)}m`, midX, midY - 3, { align: 'center' })
  }
}

function drawTraverseLines(doc: any, legs: { fromName: string; toName: string; distance: number; bearing: number }[], pointMap: Map<string, { easting: number; northing: number }>, bounds: { minE: number; maxE: number; minN: number; maxN: number }, scale: number, offset: { x: number; y: number }, amber: [number, number, number]) {
  const rangeE = bounds.maxE - bounds.minE || 1
  const rangeN = bounds.maxN - bounds.minN || 1
  
  doc.setDrawColor(...amber)
  doc.setLineWidth(0.6)
  
  for (const leg of legs) {
    const from = pointMap.get(leg.fromName)
    const to = pointMap.get(leg.toName)
    
    if (!from || !to) continue
    
    const x1 = offset.x + ((from.easting - bounds.minE) / rangeE) * 180
    const y1 = offset.y + 110 - ((from.northing - bounds.minN) / rangeN) * 110
    const x2 = offset.x + ((to.easting - bounds.minE) / rangeE) * 180
    const y2 = offset.y + 110 - ((to.northing - bounds.minN) / rangeN) * 110
    
    doc.line(x1, y1, x2, y2)
  }
}

function distanceBearingSimple(p1: { easting: number; northing: number }, p2: { easting: number; northing: number }) {
  const deltaE = p2.easting - p1.easting
  const deltaN = p2.northing - p1.northing
  const distance = Math.sqrt(deltaE * deltaE + deltaN * deltaN)
  
  let bearing = Math.atan2(deltaE, deltaN) * 180 / Math.PI
  if (bearing < 0) bearing += 360
  
  const deg = Math.floor(bearing)
  const min = Math.floor((bearing - deg) * 60)
  const sec = ((bearing - deg) * 60 - min) * 60
  
  return {
    distance,
    bearing: `${deg}°${min}'${sec.toFixed(1)}"`
  }
}
