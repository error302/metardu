import StagePage from '../StagePage'

interface Props {
  params: Promise<{ id: string }>
}

export default function DesignStage({ params }: Props) {
  return <StagePage params={params} stageId="design" />
}
