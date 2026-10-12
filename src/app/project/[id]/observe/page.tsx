import StagePage from '../StagePage'

interface Props {
  params: Promise<{ id: string }>
}

export default function ObserveStage({ params }: Props) {
  return <StagePage params={params} stageId="observe" />
}
