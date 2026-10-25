'use client'
import { useParams, useSearchParams } from 'next/navigation'
import BoundaryReview from '@/components/scheme/BoundaryReview'
export default function BoundaryReviewPage() {
  const { id } = useParams<{ id: string }>(),
    parcel = useSearchParams().get('parcel') ?? ''
  return (
    <BoundaryReview key={`${id}:${parcel}`} projectId={id} parcelId={parcel} />
  )
}
