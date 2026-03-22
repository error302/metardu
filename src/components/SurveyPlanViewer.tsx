'use client'

import React from 'react'

export interface BoundaryLine {
  p1: { x: number; y: number }
  p2: { x: number; y: number }
  distance: string
  bearing: string
  monumentP1?: 'found' | 'set' | 'nail' | 'none'
}

export interface Building {
  x: number
  y: number
  w: number
  h: number
  label: string
}

export interface SurveyPlanData {
  address: string
  lotNumber: string
  area: string
  pin: string
  lines: BoundaryLine[]
  buildings: Building[]
  adjacentLots: { text: string; x: number; y: number; rotate: number }[]
  date: string
  scaleText: string
  jobNo: string
}

const defaultData: SurveyPlanData = {
  address: '123 SURVEYOR LANE',
  lotNumber: 'LOT 5',
  area: 'AREA = 1,245.8 m²',
  pin: 'PIN 12345-6789 (LT)',
  lines: [
    { p1: { x: 300, y: 300 }, p2: { x: 800, y: 250 }, distance: '45.20', bearing: '84°17\'20"', monumentP1: 'found' },
    { p1: { x: 800, y: 250 }, p2: { x: 900, y: 800 }, distance: '78.10', bearing: '169°42\'10"', monumentP1: 'set' },
    { p1: { x: 900, y: 800 }, p2: { x: 400, y: 850 }, distance: '48.90', bearing: '264°17\'20"', monumentP1: 'nail' },
    { p1: { x: 400, y: 850 }, p2: { x: 300, y: 300 }, distance: '79.35', bearing: '349°42\'10"', monumentP1: 'found' },
  ],
  buildings: [
    { x: 450, y: 400, w: 200, h: 250, label: 'No. 123' },
    { x: 700, y: 550, w: 80, h: 100, label: 'SHED' }
  ],
  adjacentLots: [
    { text: 'LOT 4', x: 250, y: 550, rotate: -90 },
    { text: 'LOT 6', x: 950, y: 550, rotate: 90 },
    { text: 'STREET / PLAN 66R', x: 600, y: 200, rotate: 0 }
  ],
  date: 'DEC 14, 2024',
  scaleText: '1:500',
  jobNo: '24-8891'
}

export default function SurveyPlanViewer({ data = defaultData }: { data?: SurveyPlanData }) {
  const polygonPoints = data.lines.map(l => `${l.p1.x},${l.p1.y}`).join(' ')
  
  return (
    <div className="w-full h-full overflow-auto bg-[#e5e7eb] p-4 flex items-center justify-center min-h-[90vh]">
      <svg 
        viewBox="0 0 1600 1131" 
        className="bg-white shadow-2xl shrink-0" 
        style={{ 
          width: '1600px', 
          height: '1131px', 
          fontFamily: '"Courier New", Courier, "Share Tech Mono", monospace',
          color: 'black'
        }}
      >
        <defs>
          {/* Building Hatching */}
          <pattern id="bldg-hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="black" strokeWidth="0.5" opacity="0.12" />
          </pattern>
          
          {/* UTM Grid */}
          <pattern id="utm-grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <line x1="50" y1="0" x2="50" y2="100" stroke="#E0E4EC" strokeWidth="0.4" strokeDasharray="2 4" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="#E0E4EC" strokeWidth="0.4" strokeDasharray="2 4" />
            <line x1="100" y1="0" x2="100" y2="100" stroke="#B0BDD0" strokeWidth="0.8" />
            <line x1="0" y1="100" x2="100" y2="100" stroke="#B0BDD0" strokeWidth="0.8" />
          </pattern>

          {/* Monuments */}
          <g id="mon-found">
            <rect x="-5" y="-5" width="10" height="10" fill="#1A6B32" />
          </g>
          <g id="mon-set">
            <circle cx="0" cy="0" r="5" fill="none" stroke="#1A6B32" strokeWidth="2" />
          </g>
          <g id="mon-nail">
            <circle cx="0" cy="0" r="4" fill="#C0392B" />
            <line x1="-2.5" y1="0" x2="2.5" y2="0" stroke="white" strokeWidth="0.8" />
            <line x1="0" y1="-2.5" x2="0" y2="2.5" stroke="white" strokeWidth="0.8" />
          </g>
          <g id="corner-dot">
            <circle cx="0" cy="0" r="1.5" fill="black" />
            <circle cx="0" cy="0" r="4" fill="none" stroke="black" strokeWidth="1.5" />
          </g>
        </defs>

        {/* 1. Paper Background (Explicitly white by CSS but rect is safe) */}
        <rect width="1600" height="1131" fill="#FFFFFF" />

        {/* 13. Sheet Borders */}
        <rect x="5" y="5" width="1590" height="1121" fill="none" stroke="black" strokeWidth="2" />
        <rect x="10" y="10" width="1580" height="1111" fill="none" stroke="black" strokeWidth="1" />
        
        {/* Right Info Panel Divider */}
        <line x1="1168" y1="10" x2="1168" y2="1077" stroke="black" strokeWidth="2" />
        {/* Footer Divider */}
        <line x1="10" y1="1077" x2="1590" y2="1077" stroke="black" strokeWidth="2" />

        {/* 10. UTM Grid on Draft Canvas */}
        <rect x="10" y="10" width="1158" height="1067" fill="url(#utm-grid)" />
        
        {/* Grid labels */}
        <text x="18" y="1063" fontSize="8" opacity="0.6" transform="rotate(-45 18,1063)">5542000E</text>
        <text x="14" y="60" fontSize="8" opacity="0.6" textAnchor="end" transform="translate(30,0)">123400N</text>

        {/* 1. Lot Polygon Fill */}
        <polygon points={polygonPoints} fill="#F5EDD6" />

        {/* Outer/Adjacent Lines and labels */}
        {data.adjacentLots.map((lot, idx) => (
          <text 
            key={idx} 
            x={lot.x} 
            y={lot.y} 
            fontSize="11" 
            fontWeight="bold" 
            opacity="0.45" 
            textAnchor="middle" 
            transform={`rotate(${lot.rotate} ${lot.x},${lot.y})`}
          >
            {lot.text}
          </text>
        ))}

        {/* 8. Buildings & Structures */}
        {data.buildings.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="rgba(220,210,190,0.3)" stroke="black" strokeWidth="1" />
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="url(#bldg-hatch)" />
            <text x={b.x + b.w/2} y={b.y + b.h/2} fontSize="7.5" fontWeight="bold" textAnchor="middle">{b.label}</text>
            <text x={b.x + b.w/2} y={b.y + b.h/2 + 10} fontSize="7" textAnchor="middle">(structure)</text>
          </g>
        ))}

        {/* Lot Number Watermark */}
        <text x="600" y="550" fontSize="28" fontWeight="bold" fill="black" opacity="0.12" textAnchor="middle">
          {data.lotNumber}
        </text>
        <text x="600" y="570" fontSize="11" fill="black" textAnchor="middle">
          {data.area}
        </text>
        <text x="600" y="585" fontSize="8" fill="black" textAnchor="middle">
          {data.pin}
        </text>

        {/* 3. Boundary Lines (Thick) */}
        <polygon points={polygonPoints} fill="none" stroke="black" strokeWidth="2.5" strokeLinejoin="miter" />

        {/* Road Edge Lines - mock representation top boundary */}
        <line x1="200" y1="150" x2="950" y2="100" stroke="black" strokeWidth="0.8" />
        <line x1="190" y1="130" x2="960" y2="80" stroke="black" strokeWidth="2" />
        <text x="580" y="125" fontSize="14" fontWeight="bold" letterSpacing="3" transform="rotate(-5.7 580,125)">
          {data.address}
        </text>

        {/* 5. Bearings & Distances + 4. Monuments */}
        {data.lines.map((line, idx) => {
          const mx = (line.p1.x + line.p2.x) / 2
          const my = (line.p1.y + line.p2.y) / 2
          let angle = Math.atan2(line.p2.y - line.p1.y, line.p2.x - line.p1.x) * (180 / Math.PI)
          
          let flip = false
          if (angle > 90 || angle < -90) {
            angle += 180
            flip = true
          }

          return (
            <React.Fragment key={idx}>
              {/* Line Attributes */}
              <g transform={`translate(${mx}, ${my}) rotate(${angle})`}>
                <text x="0" y="-4" textAnchor="middle" fontSize="8.5" fontWeight="bold" fill="black">
                  {line.bearing}
                </text>
                <text x="0" y="4" alignmentBaseline="hanging" textAnchor="middle" fontSize="8" fill="black">
                  {line.distance} m
                </text>
              </g>

              {/* Point Corner Dots */}
              <use href="#corner-dot" x={line.p1.x} y={line.p1.y} />

              {/* Specific Monument */}
              {line.monumentP1 === 'found' && <use href="#mon-found" x={line.p1.x} y={line.p1.y} />}
              {line.monumentP1 === 'set' && <use href="#mon-set" x={line.p1.x} y={line.p1.y} />}
              {line.monumentP1 === 'nail' && (
                <g>
                  <use href="#mon-nail" x={line.p1.x} y={line.p1.y} />
                  {/* Leader line and callout for nail */}
                  <line x1={line.p1.x} y1={line.p1.y} x2={line.p1.x + 40} y2={line.p1.y - 40} stroke="#C0392B" strokeWidth="0.8" strokeDasharray="2 2" />
                  <text x={line.p1.x + 44} y={line.p1.y - 40} fill="#C0392B" fontSize="7.5" fontWeight="bold">
                    Masonry Nail / 1-00 on production
                  </text>
                  <text x={line.p1.x + 44} y={line.p1.y - 30} fill="#C0392B" fontSize="7.5" fontWeight="bold">
                    of boundary
                  </text>
                </g>
              )}
            </React.Fragment>
          )
        })}

        {/* 6. North Arrow */}
        <g transform="translate(60, 90)">
          <line x1="0" y1="0" x2="0" y2="-56" stroke="black" strokeWidth="1.5" />
          <polygon points="0,-56 -8,-40 0,-40" fill="black" />
          <polygon points="0,-56 8,-40 0,-40" fill="none" stroke="black" strokeWidth="1" />
          <text x="0" y="-68" fontSize="11" fontWeight="bold" textAnchor="middle">N</text>
        </g>

        {/* 7. Scale Bar */}
        <g transform="translate(40, 1020)">
          <rect x="0" y="0" width="40" height="6" fill="black" />
          <rect x="40" y="0" width="40" height="6" fill="white" stroke="black" strokeWidth="0.8" />
          <rect x="80" y="0" width="40" height="6" fill="black" />
          <rect x="120" y="0" width="40" height="6" fill="white" stroke="black" strokeWidth="0.8" />
          
          <text x="0" y="-4" fontSize="8" textAnchor="middle">0</text>
          <text x="40" y="-4" fontSize="8" textAnchor="middle">50</text>
          <text x="80" y="-4" fontSize="8" textAnchor="middle">100</text>
          <text x="120" y="-4" fontSize="8" textAnchor="middle">150</text>
          <text x="160" y="-4" fontSize="8" textAnchor="middle">200</text>
          
          <text x="80" y="20" fontSize="8" textAnchor="middle" letterSpacing="2">SCALE</text>
          <text x="80" y="32" fontSize="8" textAnchor="middle" letterSpacing="1">METRES</text>
        </g>

        {/* 11. Right Information Panel */}
        <g transform="translate(1185, 30)">
          <text x="0" y="0" fontSize="12" fontVariant="small-caps" letterSpacing="1">SURVEYOR&apos;S REAL PROPERTY REPORT</text>
          <text x="0" y="25" fontSize="20" fontWeight="bold">BOUNDARY IDENTIFICATION PLAN</text>
          <text x="0" y="50" fontSize="16" fontWeight="bold">MUNICIPALITY OF METROPOLIS</text>
          
          <g transform="translate(0, 90)">
            <text x="0" y="0" fontSize="11" fontWeight="bold">SCALE {data.scaleText}</text>
            {/* mini scale graphic */}
            <rect x="0" y="10" width="20" height="4" fill="black" />
            <rect x="20" y="10" width="20" height="4" fill="white" stroke="black" strokeWidth="0.5" />
            <text x="0" y="30" fontSize="7" fontStyle="italic">Distances shown are in metres. Divide by 0.3048 for feet.</text>
          </g>

          <line x1="0" y1="160" x2="385" y2="160" stroke="black" strokeWidth="1.5" />
          <text x="0" y="180" fontSize="14" fontWeight="bold">GEONOVA SURVEYS LTD.</text>
          <text x="0" y="195" fontSize="10">Ontario Land Surveyors</text>

          <g transform="translate(0, 240)">
            <text x="0" y="0" fontSize="11" fontWeight="bold" textDecoration="underline">PLAN INFORMATION</text>
            <text x="0" y="25" fontSize="9">Title Ref  : {data.pin}</text>
            <text x="0" y="40" fontSize="9">Datum      : NAD83 (CSRS)</text>
            <text x="0" y="55" fontSize="9">UTM Zone   : 17N</text>
            <text x="0" y="70" fontSize="9">Area       : {data.area.replace('AREA = ', '')}</text>
            <text x="0" y="85" fontSize="9">Drawing No.: {data.jobNo}</text>
          </g>

          <g transform="translate(0, 370)">
            <text x="0" y="0" fontSize="11" fontWeight="bold" textDecoration="underline">LEGEND</text>
            
            <use href="#mon-found" x="10" y="20" />
            <text x="30" y="24" fontSize="9">Found Monument (SSIB/SIB)</text>
            
            <use href="#mon-set" x="10" y="40" />
            <text x="30" y="44" fontSize="9">Set Monument (IB)</text>
            
            <use href="#mon-nail" x="10" y="60" />
            <text x="30" y="64" fontSize="9">Masonry Nail / Metal Pin</text>

            <rect x="5" y="75" width="10" height="10" fill="url(#bldg-hatch)" stroke="black" strokeWidth="0.5" />
            <text x="30" y="84" fontSize="9">Building Structure</text>

            <line x1="0" y1="100" x2="20" y2="100" stroke="black" strokeWidth="2.5" />
            <text x="30" y="104" fontSize="9">Subject Property Boundary</text>

            <line x1="0" y1="120" x2="20" y2="120" stroke="#888" strokeWidth="0.8" strokeDasharray="4 4" />
            <text x="30" y="124" fontSize="9">Fence line on boundary</text>
          </g>

          <g transform="translate(0, 530)">
            <rect x="0" y="0" width="385" height="70" fill="#FFFBE6" stroke="#D4C894" strokeWidth="1" />
            <text x="10" y="20" fontSize="9" fontWeight="bold">WARNING:</text>
            <text x="10" y="35" fontSize="8">This plan is not to be used for the construction of fences or</text>
            <text x="10" y="48" fontSize="8">structures without a field layout by an authorized surveyor.</text>
          </g>

          <g transform="translate(0, 650)">
            <text x="0" y="0" fontSize="11" fontWeight="bold" textDecoration="underline">SURVEYOR'S CERTIFICATE</text>
            <text x="0" y="25" fontSize="9">I CERTIFY THAT:</text>
            <text x="0" y="45" fontSize="9">1. This survey and plan are correct and in accordance with</text>
            <text x="0" y="58" fontSize="9">   the Surveys Act, the Surveyors Act and the Land Titles Act.</text>
            <text x="0" y="80" fontSize="9">2. The survey was completed on the 10th day of Dec, 2024.</text>
            
            <line x1="0" y1="150" x2="160" y2="150" stroke="black" strokeWidth="1" />
            <text x="0" y="165" fontSize="9" fontWeight="bold">THE PROFESSIONAL LICENSED SURVEYOR</text>
            <text x="0" y="180" fontSize="9">O.L.S., C.L.S.</text>
          </g>
        </g>

        {/* 12. Sheet Footer Title Block */}
        <g transform="translate(10, 1077)">
          <rect x="0" y="0" width="1580" height="34" fill="#F8F8F8" />
          {/* Columns: Field | Drawing | Checked | Address | Date | Work Order | Job No. | [COMPANY NAME in large 16px bold] */}
          <line x1="120" y1="0" x2="120" y2="34" stroke="black" strokeWidth="0.5" />
          <line x1="240" y1="0" x2="240" y2="34" stroke="black" strokeWidth="0.5" />
          <line x1="360" y1="0" x2="360" y2="34" stroke="black" strokeWidth="0.5" />
          <line x1="800" y1="0" x2="800" y2="34" stroke="black" strokeWidth="0.5" />
          <line x1="950" y1="0" x2="950" y2="34" stroke="black" strokeWidth="0.5" />
          <line x1="1100" y1="0" x2="1100" y2="34" stroke="black" strokeWidth="0.5" />
          <line x1="1220" y1="0" x2="1220" y2="34" stroke="black" strokeWidth="0.5" />

          {/* Labels */}
          <g fontSize="7" opacity="0.6">
            <text x="5" y="10">Field</text>
            <text x="125" y="10">Drawing</text>
            <text x="245" y="10">Checked</text>
            <text x="365" y="10">Address</text>
            <text x="805" y="10">Date</text>
            <text x="955" y="10">Work Order</text>
            <text x="1105" y="10">Job No.</text>
          </g>

          {/* Values */}
          <g fontSize="9" fontWeight="bold">
            <text x="5" y="24">JB / MR</text>
            <text x="125" y="24">AutoCAD GeoNova</text>
            <text x="245" y="24">SC</text>
            <text x="365" y="24">{data.address} - {data.lotNumber}</text>
            <text x="805" y="24">{data.date}</text>
            <text x="955" y="24">WO-99120</text>
            <text x="1105" y="24">{data.jobNo}</text>
          </g>

          {/* Company Name */}
          <text x="1400" y="22" fontSize="16" fontWeight="bold" textAnchor="middle" letterSpacing="1">
            GEONOVA SURVEYS LTD.
          </text>
        </g>
      </svg>
    </div>
  )
}
