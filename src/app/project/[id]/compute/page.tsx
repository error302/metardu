import StagePage from '../StagePage'

interface Props {
  params: Promise<{ id: string }>
}

export default function ComputeStage({ params }: Props) {
  return <StagePage params={params} stageId="compute" />
}
