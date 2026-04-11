/**
 * Central registry of dynamic (lazy-loaded) imports for heavy components.
 *
 * Usage:
 *   import { LazySurveyMap } from '@/lib/perf/lazyComponents'
 *   // Then use <LazySurveyMap /> directly in JSX
 */

import dynamic from 'next/dynamic'

// Helper to make dynamic imports — typed loosely since component exports vary
function lazy(loader: () => Promise<any>) {
  return dynamic(loader, { ssr: false })
}

// ─── Map Components ───────────────────────────────────────────────────────────

export const LazySurveyMap = lazy(
  () => import('@/components/map/SurveyMap')
)

export const LazySheetLayout = lazy(
  () => import('@/components/map/SheetLayout')
)

export const LazyLayerControl = lazy(
  () => import('@/components/map/LayerControl')
)

// ─── 3D / Visualization Components ────────────────────────────────────────────

export const LazyMineViewer3D = lazy(
  () => import('@/components/minetwin/MineViewer3D')
)

export const LazyImageryViewer = lazy(
  () => import('@/components/online/ImageryViewer')
)

export const LazyBathymetryMap = lazy(
  () => import('@/components/hydrolive/BathymetryMap')
)

// ─── Drawing / Canvas Components ──────────────────────────────────────────────

export const LazyTopoCanvas = lazy(
  () => import('@/components/drawing/TopoCanvas')
)

export const LazyCoordinateCanvas = lazy(
  () => import('@/components/drawing/CoordinateCanvas')
)

export const LazyCrossSectionDrawing = lazy(
  () => import('@/components/drawing/CrossSection')
)

export const LazyLongitudinalSectionDrawing = lazy(
  () => import('@/components/drawing/LongitudinalSection')
)

export const LazyFormNo4Preview = lazy(
  () => import('@/components/drawing/FormNo4Preview')
)

// ─── Report Generators ────────────────────────────────────────────────────────

export const LazyDeedPlanGenerator = lazy(
  () => import('@/components/deedplan/DeedPlanGenerator')
)

export const LazySurveyReportBuilder = lazy(
  () => import('@/components/surveyreport/SurveyReportBuilder')
)

export const LazyWorkingDiagramClient = lazy(
  () => import('@/components/working-diagram/WorkingDiagramClient')
)

// ─── GNSS / Field Components ──────────────────────────────────────────────────

export const LazyGNSSConnectionPanel = lazy(
  () => import('@/components/gnss/GNSSConnectionPanel')
)

export const LazyGNSSProcessor = lazy(
  () => import('@/components/online/GNSSProcessor')
)

// ─── Mining / Heavy Engineering ───────────────────────────────────────────────

export const LazyVolumePanel = lazy(
  () => import('@/components/minetwin/VolumePanel')
)

export const LazyMiningVolumePanel = lazy(
  () => import('@/components/mining/MiningVolumePanel')
)

export const LazyEarthworkQuantitiesTable = lazy(
  () => import('@/components/earthworks/EarthworkQuantitiesTable')
)

export const LazyMassHaulDiagram = lazy(
  () => import('@/components/earthworks/MassHaulDiagram')
)

// ─── Submissions ──────────────────────────────────────────────────────────────

export const LazySupportingDocUpload = lazy(
  () => import('@/components/submission/SupportingDocUpload')
)

// ─── Automation ───────────────────────────────────────────────────────────────

export const LazyWorkflowCanvas = lazy(
  () => import('@/components/automator/WorkflowCanvas')
)

export const LazyDataIntegrator = lazy(
  () => import('@/components/geofusion/DataIntegrator')
)

// ─── Heavy Pages (full page lazy load) ────────────────────────────────────────

export const LazyUSVMissionPlanner = lazy(
  () => import('@/components/usv/MissionPlanner')
)

export const LazyTelemetryDashboard = lazy(
  () => import('@/components/usv/TelemetryDashboard')
)

export const LazySafetyDashboard = lazy(
  () => import('@/components/minescan/SafetyDashboard')
)
