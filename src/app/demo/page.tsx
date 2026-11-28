import type { Metadata } from 'next'
import SurveyGuide from './SurveyGuide'

export const metadata: Metadata = {
  title: 'Guided survey demo | METARDU',
  description: 'Practise a cadastral traverse from field setup to a downloadable survey plan, coordinates and CAD drawing.',
}

export default function DemoPage() {
  return <SurveyGuide />
}
