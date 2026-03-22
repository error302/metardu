import SurveyPlanViewer from '@/components/SurveyPlanViewer'

export const metadata = {
  title: 'Survey Plan CAD Demo - GEONOVA'
}

export default function SurveyPlanDemoPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white px-6 py-4 shadow-sm border-b border-gray-200 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">Survey Plan CAD Generator</h1>
          <p className="text-sm text-gray-500">Live preview executing the strict master drawing prompt rules.</p>
        </div>
        <a href="/tools" className="text-sm font-semibold text-blue-600 hover:underline">
          &larr; Back to Tools
        </a>
      </header>
      <main className="flex-1 flex flex-col items-center">
        <SurveyPlanViewer />
      </main>
    </div>
  )
}
