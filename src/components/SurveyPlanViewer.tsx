'use client'

import { useState, useRef, useEffect } from 'react'
import type { SurveyPlanData, PlanOptions } from '@/lib/reports/surveyPlan/types'
import { SurveyPlanRenderer } from '@/lib/reports/surveyPlan/renderer'

interface SurveyPlanViewerProps {
  data: SurveyPlanData
  options?: PlanOptions
  className?: string
}

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 4.0]

export default function SurveyPlanViewer({ data, options, className = '' }: SurveyPlanViewerProps) {
  const [scale, setScale] = useState(1.0)
  const [svgContent, setSvgContent] = useState('')
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const renderer = new SurveyPlanRenderer(data, options)
      setSvgContent(renderer.render())
    } catch (e) {
      console.error('Survey plan render error:', e)
      setSvgContent('')
    } finally {
      setLoading(false)
    }
  }, [data, options])

  const zoomIn = () => {
    const idx = ZOOM_LEVELS.findIndex(z => z > scale)
    if (idx !== -1) setScale(ZOOM_LEVELS[idx])
  }
  const zoomOut = () => {
    const idx = ZOOM_LEVELS.findLastIndex(z => z < scale)
    if (idx !== -1) setScale(ZOOM_LEVELS[idx])
  }
  const fitToWidth = () => setScale(1.0)

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <button onClick={zoomOut} disabled={scale <= ZOOM_LEVELS[0]}
          className="px-2 py-1 text-sm rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30">−</button>
        <span className="text-xs font-mono min-w-[48px] text-center">{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} disabled={scale >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
          className="px-2 py-1 text-sm rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30">+</button>
        <button onClick={fitToWidth}
          className="px-2 py-1 text-xs rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border)]">Fit</button>
        <div className="flex-1" />
        {svgContent && (
          <a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`}
            download={`${data.project.name.replace(/\s+/g, '_')}_Plan.svg`}
            className="px-3 py-1 text-xs rounded bg-[var(--accent)] text-black font-medium hover:opacity-80">
            Download SVG
          </a>
        )}
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto bg-[#e8e8e8] p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">Generating plan...</div>
        ) : svgContent ? (
          <div className="shadow-lg mx-auto" style={{ transform: `scale(${scale})`, transformOrigin: 'top center', width: 'fit-content' }}
            dangerouslySetInnerHTML={{ __html: svgContent }} />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">No plan data available</div>
        )}
      </div>
    </div>
  )
}
