import { SurveySchedulePage } from '@/components/schedule/SurveySchedulePage'

interface Props { searchParams:Promise<Record<string,string|string[]|undefined>> }
export default async function SchedulePage({searchParams}:Props) {
  const params=await searchParams
  const text=(key:string)=>typeof params[key]==='string'?params[key]:null
  return <SurveySchedulePage focusedJob={text('job')} selectedProject={text('projectId')} newJob={text('new')==='1'}/>
}
