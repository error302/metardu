import type { EngineeringData } from '@/types/engineering'
import type { EngineeringStep } from './shared'

/**
 * Build the workflow step list for the engineering workspace sidebar.
 *
 * Extracted verbatim from src/app/project/[id]/engineering/page.tsx —
 * the routing/gating/status logic is unchanged.
 */
export function getEngineeringSteps(data: EngineeringData | null): EngineeringStep[] {
  const mode = data?.mode || 'road'
  const rd = data?.road
  const dd = data?.drainage

  const steps: EngineeringStep[] = [
    {
      id: 'setup',
      label: 'Project Setup',
      description: mode === 'road' ? 'Road name, design speed, class, standard' : 'Drainage network name, catchment area',
      status: 'complete'
    },
  ]

  if (mode === 'road') {
    const roadSetupDone = rd?.roadName && rd?.designSpeed && rd?.roadClass && rd?.standard
    steps.push({
      id: 'horizontal',
      label: 'Horizontal Alignment',
      description: 'Intersection points (IPs) and circular curves',
      status: rd?.ips?.length ? 'complete' : (roadSetupDone ? 'in_progress' : 'locked'),
      gated: true
    })

    const horizontalDone = rd?.ips?.length && rd.ips.length >= 2
    steps.push({
      id: 'vertical',
      label: 'Vertical Alignment',
      description: 'Vertical IPs (VIPs) and parabolic curves',
      status: rd?.vips?.length ? 'complete' : (horizontalDone ? 'in_progress' : 'locked'),
      gated: true
    })

    const verticalDone = rd?.vips?.length && rd.vips.length >= 1
    steps.push({
      id: 'cross_section',
      label: 'Cross Section Template',
      description: 'Carriageway, shoulders, cut/fill slopes',
      status: rd?.crossSectionTemplate ? 'complete' : (verticalDone ? 'in_progress' : 'locked'),
      gated: true
    })

    const templateDone = !!rd?.crossSectionTemplate
    steps.push({
      id: 'stations',
      label: 'Stations & Levels',
      description: 'Ground levels at chainage intervals',
      status: rd?.stations?.length ? 'complete' : (templateDone ? 'in_progress' : 'locked'),
      gated: true
    })

    const stationsDone = rd?.stations?.length && rd.stations.length >= 2
    steps.push({
      id: 'outputs',
      label: 'Computed Outputs',
      description: 'Horizontal/vertical curves, earthworks table',
      status: rd?.earthworksTable ? 'complete' : (stationsDone ? 'in_progress' : 'locked'),
      gated: true
    })

    steps.push({
      id: 'export',
      label: 'Export Package',
      description: 'PDF reports, long section, peg book',
      status: 'locked',
      gated: true
    })

    steps.push({
      id: 'long_section',
      label: 'Long Section',
      description: 'Chainage vs elevation profile',
      status: verticalDone ? 'in_progress' : 'locked',
      gated: true
    })

    steps.push({
      id: 'cross_section_view',
      label: 'Cross Sections',
      description: 'Formation template sections',
      status: stationsDone ? 'in_progress' : 'locked',
      gated: true
    })

    steps.push({
      id: 'road_reserve',
      label: 'Road Reserve',
      description: 'Reserve width & land acquisition',
      status: 'in_progress'
    })

    steps.push({
      id: 'pavement_design',
      label: 'Pavement Design',
      description: 'CBR-based layer design per KeNHA manual',
      status: stationsDone ? 'in_progress' : 'locked',
      gated: true
    })

    steps.push({
      id: 'drainage_design',
      label: 'Drainage Design',
      description: 'Manning\'s equation, pipe & channel sizing',
      status: stationsDone ? 'in_progress' : 'locked',
      gated: true
    })

    steps.push({
      id: 'as_built',
      label: 'As-Built Survey',
      description: 'Design vs constructed deviation analysis',
      status: stationsDone ? 'in_progress' : 'locked',
      gated: true
    })

    steps.push({
      id: 'road_completion',
      label: 'Completion Certificate',
      description: 'Kenya Roads Act Cap 407 certification',
      status: 'in_progress'
    })

    steps.push({
      id: 'pile_grid',
      label: 'Pile / Column Grid',
      description: 'Foundation grid generation and setting out',
      status: 'in_progress'
    })

    steps.push({
      id: 'slope_analysis',
      label: 'Slope & Area Analysis',
      description: 'DTM slope classification, cut/fill, area computation',
      status: stationsDone ? 'in_progress' : 'locked',
      gated: true
    })

    steps.push({
      id: 'progress_monitor',
      label: 'Progress Monitor',
      description: 'Construction progress tracking and inspection',
      status: 'in_progress'
    })

    steps.push({
      id: 'topo_drawing',
      label: 'Topo Drawing',
      description: 'Feature-coded survey point DXF export',
      status: 'in_progress'
    })

    steps.push({
      id: 'machine_control',
      label: 'Machine Control Export',
      description: 'Trimble, Leica, Topcon data export',
      status: 'in_progress'
    })
  } else if (mode === 'drainage') {
    const drainageSetupDone = dd?.manholes?.length ? true : false
    steps.push({
      id: 'manholes',
      label: 'Manholes',
      description: 'Define manhole locations, cover and invert levels',
      status: drainageSetupDone ? 'complete' : 'in_progress',
      gated: true
    })

    const manholesDone = dd?.manholes?.length && dd.manholes.length >= 2
    steps.push({
      id: 'pipes',
      label: 'Pipe Runs',
      description: 'Connect manholes with pipe runs and calculate gradients',
      status: manholesDone ? 'complete' : (drainageSetupDone ? 'in_progress' : 'locked'),
      gated: true
    })

    const pipesDone = dd?.pipeRuns?.length
    steps.push({
      id: 'drainage_outputs',
      label: 'Hydraulic Summary',
      description: 'Pipe capacities, velocities, sizing verification',
      status: pipesDone ? 'complete' : 'locked',
      gated: true
    })

    steps.push({
      id: 'export',
      label: 'Export Package',
      description: 'Drainage layout PDF, invert levels schedule',
      status: 'locked',
      gated: true
    })
  }

  return steps
}
