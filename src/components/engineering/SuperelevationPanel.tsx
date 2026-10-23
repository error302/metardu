'use client'

import SuperelevationCalculator from '@/components/road-design/SuperelevationCalculator'

interface SuperelevationPanelProps {
  initialRadius?: number;
  initialSpeed?: number;
  projectId?: string;
  projectData?: {
    lr_number?: string;
    county?: string;
    district?: string;
    locality?: string;
  };
  surveyorProfile?: {
    fullName: string;
    registrationNumber: string;
    firmName: string;
  } | null;
  standard?: 'KRDM2017' | 'KeRRA';
}

export default function SuperelevationPanel(_props: SuperelevationPanelProps) {
  return <section className="min-w-0 space-y-4" aria-label="Project banking calculation">
    <h3 className="text-lg font-semibold">Superelevation Calculation</h3>
    <p className="text-sm text-[var(--text-muted)]">Enter the actual geometry and declared criteria. A standard name alone does not establish its adoption or approval.</p>
    <SuperelevationCalculator />
  </section>
}
