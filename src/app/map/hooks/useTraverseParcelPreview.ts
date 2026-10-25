'use client'
import { useCallback } from 'react'
export interface UseTraverseParcelPreviewParams {
  schemeProjectId: string | null
  mapInstance: React.RefObject<import('ol/Map').default | null>
  schemeLoaded: boolean
  setSaveMsg: (message: string) => void
}
/** Compatibility bridge for older map consumers. Boundary review owns selection and writes. */
export function useTraverseParcelPreview({
  schemeProjectId,
  setSaveMsg,
}: UseTraverseParcelPreviewParams) {
  const review = useCallback(
    () =>
      setSaveMsg(
        schemeProjectId
          ? 'Choose a parcel in Blocks, then open Boundary review to select and retain its draft.'
          : 'Open a project before reviewing a parcel boundary.',
      ),
    [schemeProjectId, setSaveMsg],
  )
  return {
    traverseParcelPreviewActive: false,
    hasTraverse: false,
    createParcelFromTraversePreview: review,
    confirmTraverseParcel: review,
    cancelTraverseParcel: () => {},
  }
}
