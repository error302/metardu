'use client'

import HorizontalCurveCalculator from '@/components/road-design/HorizontalCurveCalculator'

interface HorizontalCurvePanelProps {
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
  designSpeed?: number;
}

export function HorizontalCurvePanel(_props: HorizontalCurvePanelProps) {
  return <section className="min-w-0 space-y-4" aria-label="Project horizontal curve calculation">
    <h3 className="text-lg font-semibold">Horizontal Curve Calculator</h3>
    <p className="text-sm text-[var(--text-muted)]">Local calculation draft. Project placement, visibility and design approval require their own evidence.</p>
    <HorizontalCurveCalculator />
  </section>
}
