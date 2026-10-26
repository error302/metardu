'use client'
import { useParams, useSearchParams } from 'next/navigation'
import BoundaryReview from '@/components/scheme/BoundaryReview'
import { z } from 'zod'
export default function BoundaryReviewPage() {
  const { id } = useParams<{ id: string }>(),
    params = useSearchParams(),
    parcel = params.get('parcel') ?? '',
    requested = z.string().uuid().safeParse(params.get('traverse')),
    traverse = requested.success ? requested.data : ''
  return (
    <BoundaryReview key={`${id}:${parcel}:${traverse}`} projectId={id} parcelId={parcel} initialTraverseId={traverse} />
  )
}
