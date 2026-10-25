import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import ParcelDraftSharing from '@/components/scheme/ParcelDraftSharing'
export default async function SchemeSharingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params,
    session = await getServerSession(authOptions),
    query = await searchParams
  if (!session?.user?.id)
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/project/${id}/scheme/shares`)}`,
    )
  const request =
    typeof query.export_request_id === 'string'
      ? query.export_request_id
      : undefined
  return (
    <ParcelDraftSharing
      key={`${session.user.id}:${id}`}
      projectId={id}
      viewerId={session.user.id}
      exportRequestId={request}
    />
  )
}
