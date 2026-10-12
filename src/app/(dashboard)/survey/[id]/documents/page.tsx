import { redirect } from 'next/navigation'

export default async function SurveyDocumentsPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  redirect(`/project/${params.id}/documents`)
}
