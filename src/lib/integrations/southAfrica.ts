/**
 * South Africa Land Registry Integration
 * Additional Integration - International Registries
 */

export interface SouthAfricaParcel {
  parcelId: string
  erfNumber: string
  portion: number
  township: string
  municipality: string
  province: 'Western Cape' | 'Eastern Cape' | 'Northern Cape' | 'Free State' | 'KwaZulu-Natal' | 'North West' | 'Gauteng' | 'Limpopo' | 'Mpumalanga'
  area: number
  areaUnit: 'ha' | 'sqm'
  landUse: 'residential' | 'commercial' | 'agricultural' | 'industrial' | 'mining'
  ownerName: string
  ownerId: string
  registrationDate: number
  titleDeedNumber: string
  coordinates?: {
    longitude: number
    latitude: number
  }
  sgCode: string
  status: 'registered' | 'pending' | 'encumbered'
}

export interface SouthAfricaSearchResult {
  query: string
  results: SouthAfricaParcel[]
  available: boolean
  message: string
  searchTime: number | null
}

const southAfricaRegistryData: SouthAfricaParcel[] = []

export function searchSouthAfricaRegistry(query: string): SouthAfricaSearchResult {
  void southAfricaRegistryData
  return {
    query,
    results: [],
    available: false,
    message: 'Live South African registry access is not configured. No parcel search was performed.',
    searchTime: null,
  }
}

export function getSouthAfricaParcelById(parcelId: string): SouthAfricaParcel | undefined {
  return southAfricaRegistryData.find((p) => p.parcelId === parcelId)
}

export function getSouthAfricaProvinces() {
  return [
    { name: 'Western Cape', code: 'WC' },
    { name: 'Eastern Cape', code: 'EC' },
    { name: 'Northern Cape', code: 'NC' },
    { name: 'Free State', code: 'FS' },
    { name: 'KwaZulu-Natal', code: 'KZN' },
    { name: 'North West', code: 'NW' },
    { name: 'Gauteng', code: 'GP' },
    { name: 'Limpopo', code: 'LP' },
    { name: 'Mpumalanga', code: 'MP' },
  ]
}
