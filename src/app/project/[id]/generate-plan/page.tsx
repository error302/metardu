import { redirect } from 'next/navigation'

export default function GeneratePlanPage({ params }: { params: { id: string } }) {
  redirect(`/project/${params.id}?action=generate-plan`)
}
