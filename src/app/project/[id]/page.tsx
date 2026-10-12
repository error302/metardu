import StagePage from './StagePage'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ step?: string }>
}

/**
 * Project root — the Overview stage (blueprint §33: `/projects/[id]`).
 * Legacy bookmarked workflow steps (`?step=`) still resolve to the classic
 * workspace layout.
 */
export default async function ProjectHome({ params, searchParams }: Props) {
  const { id } = await params
  const { step } = await searchParams
  if (step) {
    const { redirect } = await import('next/navigation')
    const projectPath = `/project/${encodeURIComponent(id)}`
    redirect(`${projectPath}/workspace?step=${encodeURIComponent(step)}`)
  }
  return <StagePage params={params} stageId="overview" />
}
