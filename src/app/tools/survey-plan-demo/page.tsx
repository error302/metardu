import SurveyPlanViewer from '@/components/SurveyPlanViewer'
import GeometryValidationPanel from '@/components/GeometryValidationPanel'
import type { SurveyPlanData } from '@/lib/reports/surveyPlan/types'

const demoData: SurveyPlanData = {
  project: {
    name: '',
    location: '',
    municipality: '',
    utm_zone: 37,
    hemisphere: 'S',
    datum: 'WGS84',
    client_name: '',
    surveyor_name: '',
    surveyor_licence: '',
    firm_name: '',
    firm_address: '',
    firm_phone: '',
    firm_email: '',
    drawing_no: '',
    reference: '',
    plan_title: '',
    area_sqm: 0,
    area_ha: 0,
    parcel_id: '',
    street: '',
    hundred: '',
    iskRegNo: '',
    northRotationDeg: 0,
    sheetNo: '1',
    totalSheets: '1',
    revisions: [],
  },
  parcel: {
    boundaryPoints: [],
    area_sqm: 0,
    perimeter_m: 0,
    pin: '',
    parts: [],
  },
  controlPoints: [],
  fenceOffsets: [],
}

export const metadata = {
  title: 'Survey Plan CAD Demo — METARDU'
}

export default function SurveyPlanDemoPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white px-6 py-4 shadow-sm border-b border-gray-200 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">Survey Plan CAD Generator</h1>
          <p className="text-sm text-gray-500">Live preview of the professional Boundary Identification Plan renderer.</p>
        </div>
        <a href="/tools" className="text-sm font-semibold text-blue-600 hover:underline">
          ← Back to Tools
        </a>
      </header>
      <main className="flex-1 flex flex-col items-center">
        <div className="w-full h-[75vh] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden m-4">
          <SurveyPlanViewer data={demoData} className="h-full" />
        </div>
        <div className="w-full max-w-2xl px-4 pb-4">
          <GeometryValidationPanel />
        </div>
      </main>
    </div>
  )
}
