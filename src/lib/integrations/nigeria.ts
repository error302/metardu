/**
 * Nigeria Land Registry Integration
 * Additional Integration - International Registries
 */

export interface NigeriaParcel {
  parcelId: string
  fileNumber: string
  plotNumber: string
  layoutName: string
  lga: string
  state: string
  area: number
  areaUnit: 'hectare' | 'acre' | 'sqm'
  landUse: 'residential' | 'commercial' | 'agricultural' | 'industrial'
  ownerName: string
  ownerId: string
  registrationDate: number
  titleType: 'certificate_of_occupancy' | 'deed_of_lease' | 'governors_consent'
  coordinates?: {
    easting: number
    northing: number
    zone: number
  }
  status: 'registered' | 'pending' | 'deed_filed'
}

export interface NigeriaSearchResult {
  query: string
  results: NigeriaParcel[]
  available: boolean
  message: string
  searchTime: number | null
}

// Pending: Nigeria land registry API integration.
// nigeriaRegistryData will be populated from the real registry once connected.
const nigeriaRegistryData: NigeriaParcel[] = []

export function searchNigeriaRegistry(query: string): NigeriaSearchResult {
  void nigeriaRegistryData
  return {
    query,
    results: [],
    available: false,
    message: 'Live Nigerian registry access is not configured. No parcel search was performed.',
    searchTime: null,
  }
}

export function getNigeriaParcelById(parcelId: string): NigeriaParcel | undefined {
  return nigeriaRegistryData.find((p) => p.parcelId === parcelId)
}

export function getNigeriaStates() {
  return [
    { name: 'Lagos', region: 'South West' },
    { name: 'Abuja', region: 'North Central' },
    { name: 'Rivers', region: 'South South' },
    { name: 'Delta', region: 'South South' },
    { name: 'Oyo', region: 'South West' },
    { name: 'Kano', region: 'North West' },
  ]
}
