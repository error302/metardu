import type { DeedPlanInput, DeedPlanOutput } from '@/types/deedPlan'

export async function generateDeedPlan(input: DeedPlanInput): Promise<DeedPlanOutput> {
  // This is a browser client: keep authentication and project data on this origin,
  // including when a build-time public URL points at a different environment.
  const res = await fetch('/api/deed-plan/generate', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })

  if (!res.ok) {
    const error = (await res.json().catch(() => ({ error: 'Unknown error' }))) as { error?: string }
    throw new Error(error.error || 'Failed to generate deed plan')
  }

  return (await res.json()) as DeedPlanOutput
}
