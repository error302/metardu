import { redirect } from 'next/navigation'

/** Use the shared capture map for new and populated projects on every device. */
export default async function ProjectMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/map?projectId=${encodeURIComponent(id)}`)
}
