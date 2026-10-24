'use client';

/**
 * Project-scoped topographic review and tool navigation.
 * Device checklist notes are kept separate from computation/approval evidence.
 */

import {
  Upload, Mountain, TrendingUp, Box, Scissors, FileCode, Download,
  MapPin,
} from 'lucide-react'
import TopographicProjectReview from '@/components/topo/TopographicProjectReview'

interface PipelineStep {
  id: string
  title: string
  description: string
  href: string
  icon: typeof Upload
  optional?: boolean
}

const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: 'reference', title: 'Project reference and control',
    description: 'Review the declared horizontal and height references, control sources and benchmark checks.',
    href: '', icon: MapPin,
  },
  {
    id: 'import',
    title: 'Original observations',
    description: 'Open the project observation workspace. Retain original instrument files and review coordinate imports, units and setup before processing.',
    href: '/import',
    icon: Upload,
  },
  {
    id: 'contours',
    title: 'Generate contours',
    description: 'Load this project’s points for terrain review, check missing heights and references, then set the contour interval and breaklines.',
    href: '/tools/contour-generator',
    icon: Mountain,
  },
  {
    id: 'slope',
    title: 'Slope Analysis',
    description: 'Review slope and aspect against the intended job criteria.',
    href: '/tools/slope-analysis',
    icon: TrendingUp,
    optional: true,
  },
  {
    id: 'volumes',
    title: 'Volume Computation',
    description: 'Select the applicable quantity method and review its measured surfaces, limits and assumptions.',
    href: '/tools/volume-comparison',
    icon: Box,
    optional: true,
  },
  {
    id: 'sections',
    title: 'Cross-Sections',
    description: 'Review the selected alignment, measured profiles and section outputs.',
    href: '/tools/cross-sections',
    icon: Scissors,
    optional: true,
  },
  {
    id: 'drawing',
    title: 'Topographic drawing',
    description: 'Review this project’s feature coding, spot heights, reference metadata and drawing output.',
    href: '/tools/topo-drawing',
    icon: FileCode,
  },
  {
    id: 'export',
    title: 'Review and deliver',
    description: 'Open the project delivery stage, check the retained revision and approval state, and inspect available files in the receiving applications.',
    href: '/tools/gis-export',
    icon: Download,
  },
]

export default function TopographicWorkflowPage() {
  return <TopographicProjectReview steps={PIPELINE_STEPS} />
}
