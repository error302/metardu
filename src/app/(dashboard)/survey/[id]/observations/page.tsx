import { redirect } from 'next/navigation'

export default async function ObservationsPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  redirect(`/fieldbook?project=${params.id}`)
}
