import { redirect } from 'next/navigation'

export default async function GeneratePlanPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  redirect(`/project/${params.id}/submission`)
}
