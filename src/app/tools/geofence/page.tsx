import GeofenceMonitor from '@/components/survey/GeofenceMonitor'
import { ToolGate } from '@/components/shared/ToolGate'
import { PageHeader } from '@/components/shared/PageHeader'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';


export default async function GeofencePage({ searchParams }: { searchParams: Promise<{ projectId?: string | string[] }> }) {
  const { projectId } = await searchParams
  const project = typeof projectId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(projectId) ? projectId : null
  return (
    <ToolGate toolPath="/tools/geofence">
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/tools">Tools</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Geofencing & Site Boundary Alerts</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <PageHeader
            badge="FIELD MONITORING"
            title="Geofencing & Site Boundary Alerts"
            subtitle="Test how a site perimeter, warning buffer and circular exclusion zones respond to a rover position."
          />

          <main>
            {projectId !== undefined && !project ? (
              <p role="alert">Open the geofence from a valid project workspace.</p>
            ) : (
              <GeofenceMonitor key={project ?? 'standalone'} projectId={project ?? undefined} />
            )}
          </main>
        </div>
      </div>
    </ToolGate>
  )
}
