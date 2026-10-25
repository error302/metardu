'use client'

import { useParams } from 'next/navigation'
import SchemeOverview from '@/components/scheme/SchemeOverview'

export default function SchemeWorkspacePage() {
  const { id } = useParams<{ id: string }>()
  return <SchemeOverview key={id} projectId={id} />
}
