'use client';

import { useState, useRef, useEffect } from 'react'
import type { SurveyPlanData, PlanOptions } from '@/lib/reports/surveyPlan/types'
import { SurveyPlanRenderer } from '@/lib/reports/surveyPlan/renderer'
import { FormNo4Renderer } from '@/lib/reports/surveyPlan/formNo4Renderer'
import { SurveyPlanDataSchema } from '@/lib/validation/surveySchema'
import ComplianceChecklistModal from '@/components/ComplianceChecklistModal'
import { AlertCircle, FileCheck } from 'lucide-react'
import { sanitizeHtml } from '@/lib/security/sanitize'
import { logger } from '@/lib/logger'
import { openSurveyPlanSheet } from '@/lib/print/surveyPlanSheet'

interface SurveyPlanViewerProps {
  data: SurveyPlanData
  options?: PlanOptions
  className?: string
  submissionNumber?: string // For Form No. 4
  onLayoutChange?: (layout: 'standard' | 'form4') => void
}

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 4.0]

export default function SurveyPlanViewer({ data, options, className = '', submissionNumber, onLayoutChange }: SurveyPlanViewerProps) {
  const [scale, setScale] = useState(1.0)
  const [currentSheet, setCurrentSheet] = useState(0)
  const [svgContent, setSvgContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printError, setPrintError] = useState<string | null>(null)
  const [openingPrint, setOpeningPrint] = useState(false)
  const [showCompliance, setShowCompliance] = useState(false)
  const [useFormNo4, setUseFormNo4] = useState(true) // Default to Form No. 4 for Kenya
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<SurveyPlanRenderer | FormNo4Renderer | null>(null)
  const changeLayout = (form4: boolean) => { setUseFormNo4(form4); onLayoutChange?.(form4 ? 'form4' : 'standard') }

  useEffect(() => {
    let cancelled = false
    const renderPlan = async () => {
    setLoading(true)
    setError(null)
    setSvgContent('')

    try {
      // Quality Hardening: Validate data before rendering
      const validation = SurveyPlanDataSchema.safeParse(data)
      if (!validation.success) {
        logger.error('Survey plan data validation failed:', { error: validation.error })
        if (!cancelled) setError(validation.error.errors[0].message)
        return
      }

      let renderer: SurveyPlanRenderer | FormNo4Renderer
      let content: string

      // Choose renderer based on toggle and data availability
      const hasFormNo4Data = Boolean(data.project.folioNumber || data.project.registerNumber || data.project.lrNumber || data.project.name || data.project.parcel_id)
      
      if (useFormNo4 && hasFormNo4Data) {
        // Use Kenya Form No. 4 standard
        renderer = new FormNo4Renderer(data, { ...options, submissionNumber })
        content = await (renderer as FormNo4Renderer).renderFormNo4()
      } else {
        // Use standard renderer
        renderer = new SurveyPlanRenderer(data, options)
        content = await renderer.render()
      }
      
      if (cancelled) return
      rendererRef.current = renderer
      setSvgContent(content)
    } catch (e) {
      logger.error('Survey plan render error:', { error: e })
      if (!cancelled) {
        setError(e instanceof Error ? e.message : 'Unknown rendering error')
        setSvgContent('')
      }
    } finally {
      if (!cancelled) setLoading(false)
    }
    }
    void renderPlan()
    return () => { cancelled = true }
  }, [data, options, useFormNo4, submissionNumber])

  const fitToWidth = () => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 48
      const calculatedScale = Math.min(1.5, Math.max(0.25, Number((containerWidth / 1587).toFixed(2))))
      setScale(calculatedScale)
    } else {
      setScale(0.75)
    }
  }

  // Auto-fit on mount
  useEffect(() => {
    const timer = setTimeout(() => fitToWidth(), 150)
    return () => clearTimeout(timer)
  }, [])

  const zoomIn = () => {
    const idx = ZOOM_LEVELS.findIndex(z => z > scale)
    if (idx !== -1) setScale(ZOOM_LEVELS[idx])
    else setScale(prev => Math.min(4.0, Number((prev + 0.25).toFixed(2))))
  }
  const zoomOut = () => {
    const idx = ZOOM_LEVELS.findLastIndex(z => z < scale)
    if (idx !== -1) setScale(ZOOM_LEVELS[idx])
    else setScale(prev => Math.max(0.25, Number((prev - 0.25).toFixed(2))))
  }

  const handleDownloadCSV = () => {
    if (!rendererRef.current) return
    const csv = rendererRef.current.exportToCSV()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(data.project.name || 'survey-plan').replace(/\s+/g, '_')}-bearing-schedule.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleDownloadSVG = () => {
    if (!svgContent) return
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const suffix = useFormNo4 ? '_FormNo4' : '_Plan'
    link.download = `${data.project.name.replace(/\s+/g, '_')}${suffix}.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handlePrint = async () => {
    setPrintError(null)
    setOpeningPrint(true)
    try {
      if (!svgContent || loading || error) throw new Error('Wait for a complete plan before opening the print sheet.')
      const sheets = Number(data.project.totalSheets || '1')
      await openSurveyPlanSheet(svgContent, data.project.name, useFormNo4 ? 1 : sheets)
    } catch (cause) { setPrintError(cause instanceof Error ? cause.message : 'The print sheet could not be opened.') }
    finally { setOpeningPrint(false) }
  }

  // Check if Form No. 4 data is available
  const hasFormNo4Data = Boolean(data.project.folioNumber || data.project.registerNumber || data.project.lrNumber || data.project.name || data.project.parcel_id)

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] no-print">
        <button onClick={zoomOut} disabled={scale <= ZOOM_LEVELS[0]}
          className="px-2 py-1 text-sm rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30">−</button>
        <span className="text-xs font-mono min-w-[48px] text-center">{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} disabled={scale >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
          className="px-2 py-1 text-sm rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30">+</button>
        <button onClick={fitToWidth}
          className="px-2 py-1 text-xs rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border)]">Fit</button>
        
        <div className="w-px h-6 bg-[var(--border)] mx-2" />
        
        {/* Form No. 4 Toggle */}
        {hasFormNo4Data && (
          <button
            onClick={() => changeLayout(!useFormNo4)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              useFormNo4 
                ? 'bg-green-600 text-white hover:bg-green-700' 
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
            }`}
            title={useFormNo4 ? 'Using Kenya Form No. 4 standard' : 'Using standard plan format'}
          >
            <FileCheck className="w-3.5 h-3.5" />
            {useFormNo4 ? 'Form No. 4 (Kenya)' : 'Standard Plan'}
          </button>
        )}
        
        <div className="flex-1" />
        
        {svgContent && (
          <button onClick={handleDownloadSVG}
            className="px-3 py-1 text-xs rounded bg-[var(--accent)] text-black font-medium hover:opacity-80">
            Download SVG
          </button>
        )}
        <button onClick={() => { void handlePrint() }} disabled={openingPrint || loading || !svgContent || Boolean(error)}
          className="px-3 py-1 text-xs rounded bg-gray-600 text-white hover:opacity-80">
          {openingPrint ? 'Opening print sheet…' : 'Print A3 sheet'}
        </button>
        <button onClick={handleDownloadCSV}
          className="px-3 py-1 text-xs rounded bg-green-600 text-white hover:opacity-80">
          Download CSV
        </button>
        <button onClick={() => setShowCompliance(true)}
          className="px-3 py-1 text-xs rounded bg-[var(--accent)] text-black font-semibold hover:opacity-80">
          Export Plan
        </button>
      </div>
      {printError && <p role="alert" className="px-3 py-2 text-sm text-red-500">{printError}</p>}
      
      {/* Info banner for Form No. 4 */}
      {useFormNo4 && hasFormNo4Data && (
        <div className="px-3 py-1.5 bg-green-50 border-b border-green-200 flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-green-600" />
          <span className="text-xs text-green-700">
            Form No. 4 review layout — unverified draft; field evidence and professional acceptance required
          </span>
          {submissionNumber && (
            <span className="ml-auto text-xs font-mono text-green-600">
              Submission: {submissionNumber}
            </span>
          )}
        </div>
      )}
      
      {svgContent && svgContent.includes('Sheet ') && (
        (() => {
          const match = svgContent.match(/Sheet \d+ of (\d+)/)
          const total = match ? parseInt(match[1], 10) : 1
          return (
            <div className="flex items-center justify-center gap-2 px-3 py-1 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
              <span className="text-xs font-mono text-[var(--text-secondary)]">Sheet {currentSheet + 1} of {total}</span>
              <button onClick={() => setCurrentSheet(Math.max(0, currentSheet - 1))} disabled={currentSheet === 0}
                className="px-2 py-0.5 text-xs rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30 border border-[var(--border)]">&lt;</button>
              <button onClick={() => setCurrentSheet(Math.min(total - 1, currentSheet + 1))} disabled={currentSheet >= total - 1}
                className="px-2 py-0.5 text-xs rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30 border border-[var(--border)]">&gt;</button>
            </div>
          )
        })()
      )}
      
      <div ref={containerRef} className="flex-1 overflow-auto bg-[#e8e8e8] p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] gap-3">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            <div className="font-mono text-xs uppercase tracking-widest">
              {useFormNo4 ? 'Generating Form No. 4 plan...' : 'Generating plan...'}
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center gap-4">
            <div className="p-4 rounded-full bg-red-500/10 text-red-500">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-red-500 uppercase tracking-tight">Render Failed</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">{error}</p>
            </div>
            <button
              onClick={() => {
                changeLayout(false)
                setError(null)
              }}
              className="px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-xs font-semibold hover:bg-[var(--bg-tertiary)]"
            >
              Try Standard Format
            </button>
          </div>
        ) : svgContent ? (
          svgContent.includes('Sheet ') ? (
            <div
              className="shadow-lg mx-auto"
              style={{
                width: '1587px',
                height: '1123px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  transform: `translate(${-currentSheet * 1587 * scale}px, 0) scale(${scale})`,
                  transformOrigin: 'top left',
                  position: 'absolute',
                }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(svgContent) }}
              />
            </div>
          ) : (
            <div className="shadow-lg mx-auto" style={{ transform: `scale(${scale})`, transformOrigin: 'top center', width: 'fit-content' }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(svgContent) }} />
          )
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">No plan data available</div>
        )}
      </div>

      <ComplianceChecklistModal
        isOpen={showCompliance}
        onClose={() => setShowCompliance(false)}
        data={data}
        onExport={() => { void handlePrint() }}
      />
    </div>
  )
}
