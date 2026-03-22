'use client'

import { useState } from 'react'
import type { SurveyPlanData, PlanOptions } from '@/lib/reports/surveyPlan/types'
import { SurveyPlanRenderer } from '@/lib/reports/surveyPlan/renderer'

interface SurveyPlanExportProps {
  data: SurveyPlanData
  options?: PlanOptions
}

export default function SurveyPlanExport({ data, options }: SurveyPlanExportProps) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const renderer = new SurveyPlanRenderer(data, options)
      const svgString = renderer.render()

      const container = document.createElement('div')
      container.innerHTML = svgString
      const svgEl = container.querySelector('svg')
      if (!svgEl) throw new Error('SVG element not found')

      const [{ default: Svg2Pdf }, { jsPDF }] = await Promise.all([
        import('svg2pdf.js'),
        import('jspdf'),
      ])

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' }) as any
      await (pdf as any).addSvg(svgEl, 0, 0, { width: 420, height: 297 })

      const date = new Date().toISOString().slice(0, 10)
      const filename = `${data.project.name.replace(/\s+/g, '_')}_Survey_Plan_${date}.pdf`
      pdf.save(filename)
    } catch (err) {
      console.error('PDF export error:', err)
      alert('Failed to export PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <button onClick={handleExport} disabled={exporting}
      className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-black rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
      {exporting ? (
        <><span className="animate-spin inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full" />Generating...</>
      ) : (
        <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Download PDF</>
      )}
    </button>
  )
}
