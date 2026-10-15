'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import type {
  DrainageData,
  EngineeringData,
  EngineeringMode,
  RoadDesignData,
} from '@/types/engineering'
import type { EngineeringProject, EngineeringStepId } from '../shared'
import { EngineeringPanelSkeleton } from '../shared'
import { Step1Setup } from './Step1Setup'
import { Step2Horizontal } from './Step2Horizontal'
import { Step3Vertical } from './Step3Vertical'
import { Step4CrossSection } from './Step4CrossSection'
import { Step5Stations } from './Step5Stations'
import { RoadFieldPlanStep } from './RoadFieldPlanStep'
import { Step6Outputs } from './Step6Outputs'
import { DrainageStep1Manholes } from './DrainageStep1Manholes'
import { DrainageStep2Pipes } from './DrainageStep2Pipes'
import { DrainageStep3Outputs } from './DrainageStep3Outputs'
import { calculateProjectDrainageRuns, generateProjectDrainageSetout } from '@/lib/engineering/projectDrainageEngine'
import { parseRoadFieldPlan } from '@/lib/engineering/roadFieldPlan'
import { buildRoadSchedules } from '@/lib/engineering/roadProjectOutputs'
import { engineeringScheduleCsv } from '@/lib/engineering/engineeringScheduleCsv'
import { roadSchedulePdfSections } from '@/lib/engineering/roadSchedulePresentation'
import { RoadProfilePanel } from '@/components/engineering/RoadProfilePanel'

/* ── Lazy-loaded engineering panels (only one step visible at a time) ─── */
const LongSectionRenderer = dynamic(() => import('@/components/engineering/LongSectionRenderer'), {
  ssr: false, loading: () => <EngineeringPanelSkeleton />
})
const RoadReservePanel = dynamic(() => import('@/components/engineering/RoadReservePanel'), {
  ssr: false, loading: () => <EngineeringPanelSkeleton />
})
const AsBuiltSurveyPanel = dynamic(() => import('@/components/engineering/AsBuiltSurveyPanel'), {
  ssr: false, loading: () => <EngineeringPanelSkeleton />
})
const PavementDesignPanel = dynamic(() => import('@/components/engineering/PavementDesignPanel'), {
  ssr: false, loading: () => <EngineeringPanelSkeleton />
})
const DrainageDesignPanel = dynamic(() => import('@/components/engineering/DrainageDesignPanel'), {
  ssr: false, loading: () => <EngineeringPanelSkeleton />
})
const RoadCompletionCertificatePanel = dynamic(() => import('@/components/engineering/RoadCompletionCertificatePanel'), {
  ssr: false, loading: () => <EngineeringPanelSkeleton />
})
const PileGridPanel = dynamic(() => import('@/components/engineering/PileGridPanel'), {
  ssr: false, loading: () => <EngineeringPanelSkeleton />
})
const SlopeAnalysisPanel = dynamic(() => import('@/components/engineering/SlopeAnalysisPanel'), {
  ssr: false, loading: () => <EngineeringPanelSkeleton />
})
const ProgressMonitorPanel = dynamic(() => import('@/components/engineering/ProgressMonitorPanel'), {
  ssr: false, loading: () => <EngineeringPanelSkeleton />
})
const MachineControlExportPanel = dynamic(() => import('@/components/engineering/MachineControlExportPanel'), {
  ssr: false, loading: () => <EngineeringPanelSkeleton />
})

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = engineeringScheduleCsv(headers, rows)
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function downloadSchedulePdf(filename: string, options: import('@/lib/engineering/engineeringSchedulePdf').EngineeringSchedulePdfOptions) {
  const { generateEngineeringSchedulePdf } = await import('@/lib/engineering/engineeringSchedulePdf')
  const pdf = generateEngineeringSchedulePdf(options)
  const blob = new Blob([pdf.buffer as ArrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function DrainageCsvExports({ data, projectName }: { data: DrainageData | null; projectName: string }) {
  const [pdfError, setPdfError] = useState<string | null>(null)
  const manholes = data?.manholes ?? []
  const { runs, issues } = calculateProjectDrainageRuns(manholes)
  const manholeRows = manholes.map(manhole => [
    manhole.name, manhole.chainage, manhole.easting, manhole.northing, manhole.coverLevel, manhole.invertLevelIn, manhole.invertLevelOut,
    Number.isFinite(manhole.coverLevel) && Number.isFinite(manhole.invertLevelOut)
      ? (manhole.coverLevel as number) - (manhole.invertLevelOut as number)
      : undefined,
    manhole.pipeMaterial, manhole.pipeDiameterOut, manhole.pipeOutsideDiameterOut, manhole.pipeManningN, manhole.designFlowOutLs,
  ])
  const pipeRows = runs.map(run => [
    run.fromMH, run.toMH, run.length, run.gradient, run.internalDiameterMm, run.material,
    run.manningN, run.velocity, run.fullBoreCapacity * 1000, run.designFlowLs, run.capacityStatus,
  ])
  const { stations: setoutStations, issues: setoutIssues } = generateProjectDrainageSetout(data ?? { manholes: [] })
  const setoutRows = setoutStations.map(station => [
    station.pipeId, station.stationRole, station.pipeChainageM, station.runChainageM,
    station.easting, station.northing, station.invertLevelM, station.crownLevelM,
    station.groundLevelM, station.coverAboveCrownM, station.groundStatus, station.coverAssessment,
  ])
  const exportPdf = async () => {
    setPdfError(null)
    try {
      await downloadSchedulePdf('metardu-drainage-engineering-schedules.pdf', {
        title: 'Drainage engineering schedules',
        projectName,
        coordinateReference: data?.projectCrs,
        sections: [
          { title: 'Manhole levels and pipe properties', headers: ['Manhole', 'Chainage m', 'Easting m', 'Northing m', 'Cover top RL m', 'Incoming invert RL m', 'Outgoing invert RL m', 'Depth m', 'Material', 'Pipe ID mm', 'Pipe OD mm', 'Manning n', 'Design flow L/s'], rows: manholeRows },
          { title: 'Pipe run hydraulic reference', headers: ['From MH', 'To MH', 'Length m', 'Gradient %', 'Internal diameter mm', 'Material', 'Manning n', 'Full-bore velocity m/s', 'Full-bore capacity L/s', 'Design flow L/s', 'Comparison'], rows: pipeRows },
          { title: 'Pipe invert and crown set-out', headers: ['Pipe', 'Station role', 'Pipe chainage m', 'Schedule chainage m', 'Easting m', 'Northing m', 'Invert RL m', 'Crown RL m', 'Ground RL m', 'Cover m', 'Ground status', 'Cover assessment'], rows: setoutRows },
        ],
        notes: [
          ...issues,
          ...setoutIssues,
          'Pipe set-out coordinates follow entered alignment vertices, or a straight line if none are supplied. Design inverts are interpolated between manholes; intermediate ground and cover are not surveyed or inferred.',
          'Full-bore Manning values are preliminary references. Confirm flow assumptions, pipe product, connection drops, work tolerances, trench and bedding design, utility clashes, and project criteria before construction issue.',
        ],
      })
    } catch {
      setPdfError('The PDF could not be generated. Check the project data and try again.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">Download editable project schedules. Pipe set-out follows entered alignment vertices, or a straight line where none are supplied. Intermediate ground and cover are not surveyed by this calculation.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={manholes.length === 0} onClick={() => void exportPdf()} className="rounded-lg border border-amber-600 px-4 py-2 text-sm text-amber-200 hover:bg-amber-950/50 disabled:cursor-not-allowed disabled:opacity-40">Download drainage schedules PDF</button>
        <button type="button" disabled={manholes.length === 0} onClick={() => downloadCsv('metardu-manhole-level-schedule.csv', ['Manhole', 'Chainage_m', 'Easting_m', 'Northing_m', 'Cover_or_ground_RL_m', 'Incoming_invert_RL_m', 'Outgoing_invert_RL_m', 'Depth_to_outgoing_invert_m', 'Outgoing_material', 'Hydraulic_internal_diameter_mm', 'Manufacturer_outside_diameter_mm', 'Manning_n_override', 'Design_flow_L_s'], manholeRows)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40">Download manhole schedule CSV</button>
        <button type="button" disabled={issues.length > 0 || runs.length === 0} onClick={() => downloadCsv('metardu-pipe-run-schedule.csv', ['From_manhole', 'To_manhole', 'Length_m', 'Gradient_percent', 'Hydraulic_internal_diameter_mm', 'Material', 'Manning_n_used', 'Full_bore_velocity_m_s', 'Full_bore_capacity_L_s', 'Design_flow_L_s', 'Flow_comparison'], pipeRows)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40">Download pipe run CSV</button>
        <button type="button" disabled={setoutIssues.length > 0 || setoutStations.length === 0} onClick={() => downloadCsv('metardu-drainage-pipe-setout.csv', ['Pipe', 'Station_role', 'Pipe_chainage_m', 'Schedule_chainage_m', 'Easting_m', 'Northing_m', 'Design_invert_RL_m', 'Pipe_crown_RL_m', 'Ground_RL_m', 'Cover_above_crown_m', 'Ground_status', 'Cover_assessment'], setoutRows)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40">Download pipe set-out CSV</button>
      </div>
      {pdfError && <p role="alert" className="text-sm text-red-300">{pdfError}</p>}
      {issues.length > 0 && <div role="status" className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">Pipe run CSV is unavailable until inputs are complete: {issues.join(' ')}</div>}
      {setoutIssues.length > 0 && <div role="status" className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">Pipe set-out CSV is unavailable until its project CRS, coordinates, pipe dimensions, inverts and cover criterion are complete: {setoutIssues.join(' ')}</div>}
    </div>
  )
}

function RoadCsvExports({ data, projectName, crsCode, verticalDatum }: { data: RoadDesignData | null; projectName: string; crsCode: string; verticalDatum: string | null }) {
  const [pdfError, setPdfError] = useState<string | null>(null)
  const computed = buildRoadSchedules(data, crsCode, verticalDatum)
  const verticalRows = data?.vips ?? []
  const exports = [
    computed.horizontal,
    computed.vertical, computed.verticalStations, computed.centrelineSetout,
    { name: 'Vertical design input records CSV', filename: 'metardu-vertical-design-inputs.csv', rows: verticalRows.map(ip => [ip.chainage, ip.reducedLevel, ip.gradientIn, ip.gradientOut, ip.kValue, ip.curveLength]), headers: ['Chainage_m', 'RL_m', 'Gradient_in', 'Gradient_out', 'K_value', 'Curve_length_m'] },
    computed.earthworks,
    computed.profiles,
    computed.stationLevels,
  ]
  const exportPdf = async () => {
    setPdfError(null)
    try {
      await downloadSchedulePdf('metardu-road-engineering-schedules.pdf', {
        title: 'Road engineering schedules',
        projectName,
        coordinateReference: crsCode,
        sections: roadSchedulePdfSections(exports),
        notes: [
          ...computed.issues,
          `Vertical datum / height reference: ${verticalDatum || 'NOT DECLARED'}.`,
          'Printed numerical values use three decimal places; CSV retains full calculated precision. Horizontal transition stationing is printed separately from curve parameters.',
          'Horizontal curves, parabolic vertical profiles and quantities are freshly evaluated. Tangent-intersection input RL differs from actual curve RL. Centreline coordinate targets require the declared CRS and height reference; manual targets are retained unless alignment levels are selected explicitly.',
          'Design surface RL is the finished centreline level. Formation RL subtracts the entered subgrade depth. Average end-area uses actual station spacing and separate measured cut/fill areas; material factors and curvature corrections are unassessed.',
          'Check coordinate reference, vertical datum, chainage, field control, design criteria, and current revisions before setting out or issuing for construction.',
        ],
      })
    } catch {
      setPdfError('The PDF could not be generated. Check the project data and try again.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">Export evaluated circular, symmetric transition and vertical geometry, centreline coordinate targets, measured section quantities and source records. These are draft review schedules; verify CRS, height reference, control and design revision before field issue.</p>
      {computed.issues.map(issue => <p role="status" key={issue} className="text-sm text-amber-300">{issue}</p>)}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button type="button" disabled={exports.every(item => item.rows.length === 0)} onClick={() => void exportPdf()} className="rounded-lg border border-amber-600 px-4 py-3 text-left text-sm text-amber-200 hover:bg-amber-950/50 disabled:cursor-not-allowed disabled:opacity-40">Download road schedules PDF</button>
        {exports.map(item => <button key={item.filename} type="button" disabled={item.rows.length === 0} onClick={() => downloadCsv(item.filename, item.headers, item.rows)} className="rounded-lg border border-zinc-700 px-4 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40">↓ {item.name}</button>)}
      </div>
      {pdfError && <p role="alert" className="text-sm text-red-300">{pdfError}</p>}
    </div>
  )
}

/**
 * Switch on stepId and render the appropriate step component or inline panel.
 *
 * Extracted verbatim from src/app/project/[id]/engineering/page.tsx.
 * The main page imports this function and renders it inside the workflow card;
 * the Quick Compute tab on the main page has its own separate set of dynamic
 * imports (HorizontalCurvePanel, SuperelevationPanel, VolumesPanel,
 * NetworkAdjustmentPanel, RoadReservePanel) which stay there.
 */
export function renderStepContent(
  stepId: EngineeringStepId,
  project: EngineeringProject,
  engineeringData: EngineeringData | null,
  onSave: (data: Partial<EngineeringData>) => void | Promise<boolean>,
  onModeChange?: (mode: EngineeringMode) => void
) {
  const mode = engineeringData?.mode || 'road'
  const roadData = engineeringData?.road || null
  const roadFieldPlan = parseRoadFieldPlan(engineeringData?.roadFieldPlan)
  const drainageData = engineeringData?.drainage || null
  const projectReferenceSystem = project.projectReferenceSystem
  const projectCrsSuggestion = projectReferenceSystem?.code
    ? `${projectReferenceSystem.name} (${projectReferenceSystem.code})`
    : null

  switch (stepId) {
    case 'setup':
      return (
        <Step1Setup
          project={project}
          data={roadData}
          mode={mode}
          onModeChange={(m) => onModeChange?.(m)}
          onSave={(data) => onSave({ road: { ...roadData, ...data } as RoadDesignData })}
        />
      )
    case 'field_plan':
      return (
        <RoadFieldPlanStep
          projectId={project.id}
          projectName={project.name}
          roadName={roadData?.roadName}
          roadDesign={roadData}
          projectCrsSuggestion={projectCrsSuggestion}
          projectCrsSource={projectReferenceSystem?.source ?? 'missing'}
          data={roadFieldPlan}
          onSave={onSave}
        />
      )
    case 'horizontal':
      return (
        <Step2Horizontal
          data={roadData}
          onSave={(ips) => onSave({ road: { ...roadData, ips } as RoadDesignData })}
        />
      )
    case 'vertical':
      return (
        <Step3Vertical
          data={roadData}
          onSave={(vips, interval) => onSave({ road: { ...roadData, vips, verticalStationIntervalM: interval } as RoadDesignData })}
        />
      )
    case 'cross_section':
      return (
        <Step4CrossSection
          data={roadData}
          onSave={(template) => onSave({ road: { ...roadData, crossSectionTemplate: template } as RoadDesignData })}
        />
      )
    case 'stations':
      return (
        <Step5Stations
          data={roadData}
          onSave={(stations) => onSave({ road: { ...roadData, stations } as RoadDesignData })}
        />
      )
    case 'outputs':
      return (
        <Step6Outputs
          project={project}
          data={roadData}
        />
      )
    case 'manholes':
      return (
        <DrainageStep1Manholes
          data={drainageData}
          projectId={project.id}
          onSave={(manholes, settings) => onSave({ drainage: { ...drainageData, manholes, ...settings } as DrainageData })}
        />
      )
    case 'pipes':
      return (
        <DrainageStep2Pipes
          data={drainageData}
          onSave={(pipeRuns) => onSave({ drainage: { ...drainageData, pipeRuns } as DrainageData })}
        />
      )
    case 'drainage_outputs':
      return (
        <DrainageStep3Outputs
          data={drainageData}
          projectId={project.id}
        />
      )
    case 'export':
      if (mode === 'drainage') {
        return (
          <div className="space-y-6">
            <div>
              <h3 className="mb-1 text-lg font-semibold text-white">Drainage schedules</h3>
              <p className="text-sm text-zinc-400">Create field-reviewable schedules from the saved project inputs.</p>
            </div>
            <DrainageCsvExports data={drainageData} projectName={project.name} />
          </div>
        )
      }
      return (
        <div className="space-y-6">
          <div>
            <h3 className="mb-1 text-lg font-semibold text-white">Road calculation schedules</h3>
            <p className="text-sm text-zinc-400">Export the saved project calculations for review or transfer to field tools.</p>
          </div>
          <RoadCsvExports data={roadData} projectName={project.name} crsCode={projectReferenceSystem?.code ?? ''} verticalDatum={projectReferenceSystem?.verticalDatum ?? null} />
        </div>
      )
    case 'long_section': {
      return <LongSectionRenderer data={roadData} projectName={project.name} heightReference={projectReferenceSystem?.verticalDatum ?? null} />
    }
    case 'cross_section_view': {
      return <RoadProfilePanel data={roadData} />
    }
    case 'pavement_design': {
      const stations = roadData?.stations || []
      const template = roadData?.crossSectionTemplate
      const roadLength = stations.length >= 2 ? stations[stations.length - 1].chainage - stations[0].chainage : 0
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Pavement Layer Design</h3>
          <p className="text-zinc-400 text-sm mb-4">CBR-based pavement design per KeNHA Pavement Design Manual. Input traffic &amp; subgrade data to determine layer thicknesses.</p>
          <PavementDesignPanel
            roadClass={roadData?.roadClass}
            carriagewayWidth={template?.carriagewayWidth}
            roadLength={roadLength > 0 ? roadLength : undefined}
          />
        </div>
      )
    }
    case 'drainage_design': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Drainage Design Tools</h3>
          <p className="text-zinc-400 text-sm mb-4">Standalone hydraulic screening calculations. Confirm rainfall, catchment, pipe product and governing project criteria before design approval.</p>
          <DrainageDesignPanel />
        </div>
      )
    }
    case 'as_built': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">As-Built Survey</h3>
          <p className="text-zinc-400 text-sm mb-4">Compare design levels against as-built survey data. Paste CSV (chainage, design_level, as_built_level) to compute deviations and KeNHA compliance.</p>
          <AsBuiltSurveyPanel roadClass={roadData?.roadClass} />
        </div>
      )
    }
    case 'road_completion': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Road Completion Certificate</h3>
          <p className="text-zinc-400 text-sm mb-4">Generate a road completion certificate per Kenya Roads Act, Cap 407. Fill in project details, certification checklist, and surveyor declaration.</p>
          <RoadCompletionCertificatePanel roadClass={roadData?.roadClass} />
        </div>
      )
    }
    case 'road_reserve': {
      const stations = roadData?.stations || []
      const template = roadData?.crossSectionTemplate
      const roadLength = stations.length >= 2 ? stations[stations.length - 1].chainage - stations[0].chainage : 0
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Road Reserve</h3>
            <p className="text-zinc-400 text-sm">Reserve width compliance, land acquisition estimate, and property impact.</p>
          </div>
          <RoadReservePanel
            roadClass={roadData?.roadClass || 'C'}
            roadLength={roadLength || undefined}
            existingRoadWidth={template?.carriagewayWidth ? template.carriagewayWidth + template.shoulderWidth * 2 : undefined}
          />
        </div>
      )
    }
    case 'pile_grid': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Pile / Column Grid Setting Out</h3>
          <p className="text-zinc-400 text-sm mb-4">Generate pile or column grid coordinates, compute bearings and distances from an instrument station, and export DXF setout drawings.</p>
          <PileGridPanel key={project.id} projectId={project.id} crsCode={projectReferenceSystem?.code ?? ''} heightReference={projectReferenceSystem?.verticalDatum ?? null} />
        </div>
      )
    }
    case 'slope_analysis': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Slope &amp; Area Analysis</h3>
          <p className="text-zinc-400 text-sm mb-4">DTM slope classification, cut/fill volume computation, and area calculation per KENHA standards.</p>
          <SlopeAnalysisPanel />
        </div>
      )
    }
    case 'progress_monitor': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Construction Progress Monitor</h3>
          <p className="text-zinc-400 text-sm mb-4">Track construction progress against programme milestones with S-curve analysis, inspection workflow, and photo attachments.</p>
          <ProgressMonitorPanel projectId={project.id || ''} />
        </div>
      )
    }
    case 'topo_drawing': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Topographic Drawing Composer</h3>
          <p className="text-zinc-400 text-sm mb-4">Assign feature codes to survey points and produce professional DXF drawings with proper layers, spot heights, and sheet layout.</p>
          <div className="text-amber-400/80 text-sm bg-amber-900/20 border border-amber-800 rounded-lg p-3">
            For the full topographic drawing experience with feature code browser and SVG preview, use the dedicated tool at{' '}
            <a href="/tools/topo-drawing" className="underline text-amber-400 hover:text-amber-300">Tools → Topographic Drawing</a>.
          </div>
        </div>
      )
    }
    case 'machine_control': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Machine Control Export</h3>
          <p className="text-zinc-400 text-sm mb-4">Export design points in formats compatible with Trimble, Leica, and Topcon machine control systems.</p>
          <MachineControlExportPanel />
        </div>
      )
    }
    default:
      return <div>Unknown step</div>
  }
}
