export type EquipmentType =
  | 'TOTAL_STATION'
  | 'GNSS_RECEIVER'
  | 'LEVEL'
  | 'THEODOLITE'
  | 'EDM'
  | 'PRISM'
  | 'STAFF'
  | 'TAPE'
  | 'SOFTWARE'
  | 'OTHER'

export interface Equipment {
  id: string
  userId: string
  name: string
  type: EquipmentType
  make: string
  model: string
  serialNumber: string
  purchaseDate?: string
  lastCalibrationDate: string
  nextCalibrationDue: string
  calibrationInterval: number
  calibrationCertNumber: string
  calibrationLab: string
  status: 'CURRENT' | 'DUE_SOON' | 'OVERDUE' | 'INACTIVE'
  notes?: string
  calibrationHistory?: CalibrationRecord[]
}

export interface CalibrationRecord {
  id: string
  equipmentId: string
  date: string
  certNumber: string
  lab: string
  technician: string
  result: 'PASS' | 'FAIL' | 'CONDITIONAL'
  findings: string
  corrections?: string
  nextDueDate: string
  documentPath?: string
}

export interface CreateEquipmentRequest {
  name: string
  type: EquipmentType
  make: string
  model: string
  serialNumber: string
  purchaseDate?: string
  lastCalibrationDate: string
  calibrationInterval?: number
  calibrationCertNumber: string
  calibrationLab: string
  notes?: string
}

export interface CreateCalibrationRecordRequest {
  date: string
  certNumber: string
  lab: string
  technician: string
  result: CalibrationRecord['result']
  findings: string
  corrections?: string
  nextDueDate: string
  documentPath?: string
}
