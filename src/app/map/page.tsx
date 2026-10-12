'use client'
import dynamic from 'next/dynamic'
import { LoadingState } from '@/components/shared/LoadingState'

const MapClient = dynamic(() => import('./MapClient'), {
  ssr: false,
  loading: () => <LoadingState message="Loading survey map" />,
})

export default function GlobalMapPage() {
  return <MapClient />
}
