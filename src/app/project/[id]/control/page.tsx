import StagePage from '../StagePage'

interface Props {
  params: Promise<{ id: string }>
}

export default function ControlStage({ params }: Props) {
  return <StagePage params={params} stageId="control" />
}
