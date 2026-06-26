import { redirect } from 'next/navigation'

export default function WorkspaceRedirect({ params }: { params: { id: string } }) {
  redirect(`/project/${params.id}`)
}
