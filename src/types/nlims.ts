export interface NLIMSParcel {
  parcelNumber: string
  registrationSection: string
  county: string
  area: number
  areaHectares: number
  ownerName: string
  ownerType: 'INDIVIDUAL' | 'COMPANY' | 'GOVERNMENT' | 'TRUST'
  titleDeedNumber: string
  titleDeedDate: string
  encumbrances: Encumbrance[]
  status: 'REGISTERED' | 'PENDING' | 'DISPUTED' | 'CANCELLED'
  lastTransactionDate: string
  lastTransactionType: string
  coordinates?: NLIMSCoordinate[]
  source: 'NLIMS_LIVE' | 'NLIMS_CACHED' | 'MANUAL' | 'VAULT_PERSONAL' | 'VAULT_SHARED'
  fetchedAt: string
}

export interface Encumbrance {
  type: 'CHARGE' | 'CAUTION' | 'RESTRICTION' | 'EASEMENT'
  description: string
  registeredDate: string
  registeredBy: string
}

export interface NLIMSCoordinate {
  cornerNumber: number
  easting: number
  northing: number
  utmZone: number
}

export interface NLIMSSearchResult {
  found: boolean
  parcel?: NLIMSParcel
  error?: string
  isMockData: boolean
}
