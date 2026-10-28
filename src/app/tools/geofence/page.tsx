'use client'

import React from 'react';
import GeofenceMonitor from '@/components/survey/GeofenceMonitor'
import { ToolGate } from '@/components/shared/ToolGate'
import { PageHeader } from '@/components/shared/PageHeader'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';


export default function GeofencePage() {
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
            badge="SITE SAFETY &amp; GEOFENCING"
            title="Geofencing, Buffer Proximity & Boundary Breach Monitor"
            subtitle="Real-time site perimeter monitoring using Jordan curve polygon ray-casting. Configure custom boundary coordinates, buffer alert thresholds, and restricted hazard zones (riparian reserves, powerlines) with audio/haptic alarms and incident logging."
            reference="Survey Regulations 1994 Reg. 20 | Jordan Curve Polygon Point-In-Polygon"
          />

          <main>
            <GeofenceMonitor />
          </main>
        </div>
      </div>
    </ToolGate>
  )
}
