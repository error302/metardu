import StagePage from '../StagePage'

interface Props {
  params: Promise<{ id: string }>
}

export default function DeliverStage({ params }: Props) {
  return <StagePage params={params} stageId="deliver" />
}
