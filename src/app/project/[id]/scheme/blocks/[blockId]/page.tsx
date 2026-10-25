'use client'

import { useParams } from 'next/navigation'
import BlockParcelRegister from '@/components/scheme/BlockParcelRegister'

export default function BlockDetailPage(){
  const {id,blockId}=useParams<{id:string;blockId:string}>()
  return <BlockParcelRegister key={`${id}:${blockId}`} projectId={id} blockId={blockId}/>
}
