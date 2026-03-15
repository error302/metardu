/**
 * Equipment Calibration Tracker
 * Phase 8 - Integration Layer
 * Track and manage survey equipment calibration schedules
 */

export interface Equipment {
  id: string
  name: string
  type: 'total_station' | 'gnss' | 'level' | 'theodolite' | 'edm' | 'accessory'
  brand: string
  model: string
  serialNumber: string
  purchaseDate?: string
  calibrationDate?: string
  nextCalibrationDate?: string
  calibrationInterval: number
  status: 'active' | 'calibrating' | 'due' | 'overdue' | 'retired'
  lastCalibrationResult?: 'passed' | 'failed' | 'adjusted'
  calibrationCertificate?: string
  location?: string
  assignedTo?: string
  notes?: string
}

export interface CalibrationRecord {
  id: string
  equipmentId: string
  date: string
  result: 'passed' | 'failed' | 'adjusted'
  technician: string
  certificate: string
  corrections: {
    parameter: string
    before: number
    after: number
    tolerance: number
  }[]
  nextDue: string
}

export interface CalibrationAlert {
  equipment: Equipment
  daysUntilDue: number
  severity: 'ok' | 'due' | 'overdue'
}

const MOCK_EQUIPMENT: Equipment[] = [
  {
    id: 'EQ001',
    name: 'Leica TS16',
    type: 'total_station',
    brand: 'Leica',
    model: 'TS16 Apowers',
    serialNumber: '1847293',
    purchaseDate: '2022-03-15',
    calibrationDate: '2024-01-20',
    nextCalibrationDate: '2025-01-20',
    calibrationInterval: 365,
    status: 'active',
    lastCalibrationResult: 'passed',
    location: 'Nairobi Office'
  },
  {
    id: 'EQ002',
    name: 'Trimble S9',
    type: 'total_station',
    brand: 'Trimble',
    model: 'S9 HP',
    serialNumber: 'TR8845621',
    purchaseDate: '2021-08-10',
    calibrationDate: '2024-06-15',
    nextCalibrationDate: '2024-12-15',
    calibrationInterval: 180,
    status: 'due',
    lastCalibrationResult: 'adjusted',
    location: 'Field Kit A'
  },
  {
    id: 'EQ003',
    name: 'Topcon GR-5',
    type: 'gnss',
    brand: 'Topcon',
    model: 'GR-5',
    serialNumber: 'TC551234',
    purchaseDate: '2023-01-05',
    calibrationDate: '2024-02-28',
    nextCalibrationDate: '2025-02-28',
    calibrationInterval: 365,
    status: 'active',
    lastCalibrationResult: 'passed',
    location: 'Mombasa Office'
  },
  {
    id: 'EQ004',
    name: 'Leica DNA03',
    type: 'level',
    brand: 'Leica',
    model: 'DNA03',
    serialNumber: 'LC887654',
    purchaseDate: '2020-11-20',
    calibrationDate: '2024-03-10',
    nextCalibrationDate: '2024-09-10',
    calibrationInterval: 180,
    status: 'overdue',
    lastCalibrationResult: 'passed',
    location: 'Kisumu Office'
  },
  {
    id: 'EQ005',
    name: 'Sokkia SDL1X',
    type: 'level',
    brand: 'Sokkia',
    model: 'SDL1X',
    serialNumber: 'SK331256',
    purchaseDate: '2022-07-01',
    calibrationDate: '2024-05-22',
    nextCalibrationDate: '2025-05-22',
    calibrationInterval: 365,
    status: 'active',
    lastCalibrationResult: 'passed',
    location: 'Nairobi Office'
  }
]

export function getAllEquipment(): Equipment[] {
  return MOCK_EQUIPMENT
}

export function getEquipmentById(id: string): Equipment | null {
  return MOCK_EQUIPMENT.find(e => e.id === id) || null
}

export function getEquipmentByType(type: Equipment['type']): Equipment[] {
  return MOCK_EQUIPMENT.filter(e => e.type === type)
}

export function getEquipmentByStatus(status: Equipment['status']): Equipment[] {
  return MOCK_EQUIPMENT.filter(e => e.status === status)
}

export function getCalibrationAlerts(): CalibrationAlert[] {
  const today = new Date()
  
  return MOCK_EQUIPMENT
    .filter(e => e.nextCalibrationDate && e.status !== 'retired')
    .map(equipment => {
      const dueDate = new Date(equipment.nextCalibrationDate!)
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      
      let severity: 'ok' | 'due' | 'overdue' = 'ok'
      if (daysUntilDue < 0) {
        severity = 'overdue'
      } else if (daysUntilDue <= 30) {
        severity = 'due'
      }
      
      return {
        equipment,
        daysUntilDue,
        severity
      }
    })
    .filter(alert => alert.severity !== 'ok')
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
}

export function addEquipment(equipment: Omit<Equipment, 'id'>): Equipment {
  const newEquipment: Equipment = {
    ...equipment,
    id: `EQ${String(MOCK_EQUIPMENT.length + 1).padStart(3, '0')}`
  }
  MOCK_EQUIPMENT.push(newEquipment)
  return newEquipment
}

export function updateEquipment(id: string, updates: Partial<Equipment>): Equipment | null {
  const index = MOCK_EQUIPMENT.findIndex(e => e.id === id)
  if (index === -1) return null
  
  MOCK_EQUIPMENT[index] = { ...MOCK_EQUIPMENT[index], ...updates }
  return MOCK_EQUIPMENT[index]
}

export function recordCalibration(
  equipmentId: string,
  record: Omit<CalibrationRecord, 'id' | 'equipmentId'>
): CalibrationRecord | null {
  const equipment = getEquipmentById(equipmentId)
  if (!equipment) return null
  
  const newRecord: CalibrationRecord = {
    ...record,
    id: `CAL${Date.now()}`,
    equipmentId
  }
  
  equipment.calibrationDate = record.date
  equipment.nextCalibrationDate = record.nextDue
  equipment.lastCalibrationResult = record.result
  equipment.status = record.result === 'failed' ? 'calibrating' : 'active'
  
  return newRecord
}

export function getEquipmentTypes(): { id: Equipment['type']; name: string }[] {
  return [
    { id: 'total_station', name: 'Total Station' },
    { id: 'gnss', name: 'GNSS Receiver' },
    { id: 'level', name: 'Digital Level' },
    { id: 'theodolite', name: 'Theodolite' },
    { id: 'edm', name: 'EDM' },
    { id: 'accessory', name: 'Accessory' }
  ]
}

export function getBrands(): string[] {
  return ['Leica', 'Trimble', 'Topcon', 'Sokkia', 'Nikon', 'Pentax', 'GeoMax', 'Spectra']
}

export function getCalibrationSummary(): {
  total: number
  active: number
  due: number
  overdue: number
  calibrating: number
} {
  return {
    total: MOCK_EQUIPMENT.length,
    active: MOCK_EQUIPMENT.filter(e => e.status === 'active').length,
    due: MOCK_EQUIPMENT.filter(e => e.status === 'due').length,
    overdue: MOCK_EQUIPMENT.filter(e => e.status === 'overdue').length,
    calibrating: MOCK_EQUIPMENT.filter(e => e.status === 'calibrating').length
  }
}
