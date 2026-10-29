'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { SurveySchedulePage } from '@/components/schedule/SurveySchedulePage'

function ScheduleRoute() {
  const params=useSearchParams()
  const text=(key:string)=>{
    const values=params?.getAll(key)
    return values?.length===1?values[0]:null
  }
  return <SurveySchedulePage focusedJob={text('job')} selectedProject={text('projectId')} newJob={text('new')==='1'}/>
}

export default function SchedulePage() {
  return <Suspense fallback={<div role="status" className="mx-auto max-w-5xl p-6">Preparing your survey schedule…</div>}><ScheduleRoute/></Suspense>
}
