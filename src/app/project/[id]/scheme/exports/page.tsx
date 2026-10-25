'use client'
import { useParams, useSearchParams } from 'next/navigation'
import SchemeExportReview from '@/components/scheme/SchemeExportReview'
export default function SchemeExportsPage() {
  const { id } = useParams<{ id: string }>(),
    ids = useSearchParams().getAll('parcel_id')
  return (
    <SchemeExportReview
      key={`${id}:${ids.join(',')}`}
      projectId={id}
      parcelIds={ids}
    />
  )
}
