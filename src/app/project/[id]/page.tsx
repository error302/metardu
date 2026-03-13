import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

interface PageProps {
  params: { id: string }
}

export default async function ProjectPage({ params }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!project) {
    redirect('/dashboard')
  }

  const { data: points } = await supabase
    .from('points')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: true })

  return (
    <div className="min-h-screen bg-gray-950 flex">
      <aside className="w-64 border-r border-gray-800 bg-gray-900/30 p-4">
        <Link href="/dashboard" className="text-xl font-bold mb-8 block" style={{ color: '#E8841A' }}>
          GEONOVA
        </Link>
        
        <div className="space-y-2">
          <button
            disabled
            className="w-full px-4 py-2 bg-gray-800 text-gray-400 rounded text-sm cursor-not-allowed"
          >
            Add Point
          </button>
          <button
            disabled
            className="w-full px-4 py-2 bg-gray-800 text-gray-400 rounded text-sm cursor-not-allowed"
          >
            Upload CSV
          </button>
          <button
            disabled
            className="w-full px-4 py-2 bg-gray-800 text-gray-400 rounded text-sm cursor-not-allowed"
          >
            Run Traverse
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="border-b border-gray-800 bg-gray-900/30 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-100">{project.name}</h1>
              <p className="text-sm text-gray-400">
                UTM Zone {project.utm_zone}{project.hemisphere}
                {project.location && ` — ${project.location}`}
              </p>
            </div>
          </div>
        </header>

        <div className="flex-1 p-6">
          <div className="mb-6">
            <div className="border border-gray-800 bg-gray-900/30 rounded-lg p-8 text-center">
              <p className="text-gray-400">Map coming soon</p>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-100 mb-4">Coordinates</h2>
            <div className="border border-gray-800 bg-gray-900/30 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Point Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Easting (m)</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Northing (m)</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Elevation (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {points && points.length > 0 ? (
                    points.map((point) => (
                      <tr key={point.id} className="border-b border-gray-800/50">
                        <td className="px-4 py-3 font-mono text-gray-100">{point.name}</td>
                        <td className="px-4 py-3 font-mono text-gray-300">{point.easting?.toFixed(4)}</td>
                        <td className="px-4 py-3 font-mono text-gray-300">{point.northing?.toFixed(4)}</td>
                        <td className="px-4 py-3 font-mono text-gray-300">{point.elevation?.toFixed(4) ?? '—'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        No points yet. Use "Add Point" to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
