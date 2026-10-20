import type { FieldObservation } from './offlineStorage'

/** The original mobile delivery mapping, shared with explicit recovery review. */
export function mobileObservationCapture(payload: FieldObservation & { id: string; timestamp: number }) {
  return { ...payload,
    surveyType: payload.surveyType ?? (payload.observationType === 'level' ? 'leveling' : payload.observationType === 'gps' ? 'gnss' : 'unspecified'),
    station: payload.pointName, pointId: payload.pointId ?? payload.pointName,
    targetHeight: payload.rodHeight, createdAt: new Date(payload.timestamp).toISOString(),
  }
}
