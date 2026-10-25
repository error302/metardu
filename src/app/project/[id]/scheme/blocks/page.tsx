'use client'

import { useParams } from 'next/navigation'
import BlockManagement from '@/components/scheme/BlockManagement'

export default function BlocksPage() {
  const { id } = useParams<{ id: string }>()
  return <BlockManagement key={id} projectId={id} />
}
