import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SubscriptionStatus from '@/components/SubscriptionStatus'
import UpgradePrompt from '@/components/UpgradePrompt'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('*, subscription_plans(*)')
    .eq('user_id', user.id)
    .single()

  const canCreateProject = subscription?.plan_id !== 'free' || (projects?.length || 0) < 1
  const plan = subscription?.plan_id || 'free'

  return (
    <div className="min-h-screen bg-gray-950">
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Subscription Status */}
        <SubscriptionStatus subscription={subscription} />

        {/* Trial Welcome Banner */}
        {subscription?.status === 'trial' && (
          <div className="mb-6 p-4 bg-green-900/20 border border-green-500/50 rounded-lg">
            <p className="text-green-400">
              🎉 Welcome to GeoNova! Your 14-day Pro trial is active. 
              Enjoy all Pro features until {new Date(subscription.trial_ends_at).toLocaleDateString()}.
            </p>
          </div>
        )}

        {/* Process Field Notes - Flagship Feature */}
        <div className="mb-8 p-6 bg-gradient-to-r from-[#E8841A]/20 to-transparent border border-[#E8841A]/30 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-100 mb-1">📋 Process Field Notes</h2>
              <p className="text-gray-400 text-sm">
                Drop your CSV and let GeoNova do the rest. Supports: Traverse, Leveling, Radiation
              </p>
            </div>
            <Link
              href="/process"
              className="px-6 py-3 bg-[#E8841A] hover:bg-[#d67715] text-black font-semibold rounded-lg transition-colors"
            >
              Start Processing
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-100">Your Projects</h1>
          {canCreateProject ? (
            <Link
              href="/project/new"
              className="px-6 py-2 bg-[#E8841A] hover:bg-[#d67715] text-black font-semibold rounded transition-colors"
            >
              New Project
            </Link>
          ) : (
            <Link
              href="/pricing"
              className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded transition-colors"
            >
              Upgrade to Create More
            </Link>
          )}
        </div>

        {/* Upgrade Prompt for Free Users */}
        {!canCreateProject && (
          <UpgradePrompt type="projects" />
        )}

        {!projects || projects.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 mb-4">No projects yet</p>
            {canCreateProject ? (
              <Link
                href="/project/new"
                className="inline-block px-6 py-2 bg-[#E8841A] hover:bg-[#d67715] text-black font-semibold rounded transition-colors"
              >
                Create Your First Project
              </Link>
            ) : (
              <Link
                href="/pricing"
                className="inline-block px-6 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded transition-colors"
              >
                Upgrade to Pro
              </Link>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <div
                key={project.id}
                className="border border-gray-800 bg-gray-900/50 rounded-lg p-6 hover:border-[#E8841A]/50 transition-colors"
              >
                <h3 className="text-lg font-semibold text-gray-100 mb-2">
                  {project.name}
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  {project.location || 'No location'}
                </p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    UTM Zone {project.utm_zone} {project.hemisphere}
                  </span>
                  <span className="text-gray-500">
                    {new Date(project.created_at).toLocaleDateString()}
                  </span>
                </div>
                <Link
                  href={`/project/${project.id}`}
                  className="mt-4 block w-full text-center py-2 bg-gray-800 hover:bg-gray-700 text-[#E8841A] rounded transition-colors"
                >
                  Open
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
