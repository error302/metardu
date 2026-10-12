import StagePage from '../StagePage'

interface Props {
  params: Promise<{ id: string }>
}

export default function VerifyStage({ params }: Props) {
  return <StagePage params={params} stageId="verify" />
}
