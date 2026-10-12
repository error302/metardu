'use client'

import MultiCORSSelector from '@/components/gnss/MultiCORSSelector'
import { ToolGate } from '@/components/shared/ToolGate'
import { PageHeader } from '@/components/shared/PageHeader'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { RadioTower } from 'lucide-react'

export default function MultiCORSPage() {
  return (
    <ToolGate toolPath="/tools/cors-networks">
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/tools">Tools</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Multi-CORS Network Selector</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <PageHeader
            badge="NTRIP GNSS"
            title="Multi-CORS Network Selector & NTRIP Profiles"
            subtitle="Locate optimal regional & global GNSS reference stations (KENCORS, TANZACORS, Uganda CORS, IGS), evaluate baseline tolerances per ISO 17123-8, and export controller profiles for Leica, Trimble, SurvCE, and South/CHCNAV."
            reference="ISO 17123-8 | Survey of Kenya KENCORS | IGS Global Network"
          />

          <main>
            <MultiCORSSelector />
          </main>
        </div>
      </div>
    </ToolGate>
  )
}
