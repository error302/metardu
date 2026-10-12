import { redirect } from 'next/navigation'

export default async function ComputePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  redirect(`/project/${params.id}?step=3`)
}
