import { redirect } from 'next/navigation'

export default async function SurveyMapPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  redirect(`/project/${params.id}/map`)
}
