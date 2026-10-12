import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

/**
 * Overview moved to the project root (blueprint §33). This route stays as a
 * bookmark/link-safe redirect so nothing 404s.
 */
export default async function OverviewStageRedirect({ params }: Props) {
  const { id } = await params
  redirect(`/project/${encodeURIComponent(id)}`)
}
