/**
 * Tanzania Land Registry Integration
 * Phase 8 - Integration Layer
 * Connects to Tanzania's Ministry of Lands Land Registry
 */

export interface TanzaniaPlot {
  plotNumber: string
  sheetNumber: string
  district: String
  region: string
  ward: string
  village?: string
  landType: 'urban' | 'rural'
  landUse: string
  extent: number
  extentUnit: 'sqm' | 'acres' | 'ha'
  owners: string[]
  tenure: 'grant' | 'leasehold' | 'customary' | 'right_of_occupancy'
  grantDate?: string
  expiryDate?: string
  coordinates?: {
    type: 'Polygon'
    coordinates: number[][][]
  }
}

export interface TanzaniaSearchParams {
  plotNumber?: string
  sheetNumber?: string
  district?: string
  region?: string
  ward?: string
  ownerName?: string
}

export interface TanzaniaResult {
  success: boolean
  plots?: TanzaniaPlot[]
  total?: number
  error?: string
}

const MOCK_TANZANIA_DATA: TanzaniaPlot[] = []

export async function searchPlot(params: TanzaniaSearchParams): Promise<TanzaniaResult> {
  await new Promise(resolve => setTimeout(resolve, 500))
  
  let results = [...MOCK_TANZANIA_DATA]
  
  if (params.plotNumber) {
    results = results.filter((p: any) => p.plotNumber.toLowerCase().includes(params.plotNumber!.toLowerCase()))
  }
  
  if (params.sheetNumber) {
    results = results.filter((p: any) => 
      p.sheetNumber.toLowerCase().includes(params.sheetNumber!.toLowerCase())
    )
  }
  
  if (params.district) {
    results = results.filter((p: any) => 
      p.district.toLowerCase() === params.district!.toLowerCase()
    )
  }
  
  if (params.region) {
    results = results.filter((p: any) => 
      p.region.toLowerCase() === params.region!.toLowerCase()
    )
  }
  
  if (params.ward) {
    results = results.filter((p: any) => 
      p.ward.toLowerCase().includes(params.ward!.toLowerCase())
    )
  }
  
  if (params.ownerName) {
    results = results.filter((p: any) => 
      p.owners.some((o: any) => o.toLowerCase().includes(params.ownerName!.toLowerCase()))
    )
  }
  
  return {
    success: true,
    plots: results,
    total: results.length
  }
}

export async function getPlotByNumber(plotNumber: string): Promise<TanzaniaPlot | null> {
  await new Promise(resolve => setTimeout(resolve, 300))
  return MOCK_TANZANIA_DATA.find((p: any) => p.plotNumber === plotNumber) || null
}

export function getTenureTypes(): { id: string; name: string }[] {
  return [
    { id: 'grant', name: 'Grant' },
    { id: 'leasehold', name: 'Leasehold' },
    { id: 'customary', name: 'Customary' },
    { id: 'right_of_occupancy', name: 'Right of Occupancy' }
  ]
}

export function getRegions(): string[] {
  return [
    'Dar es Salaam', 'Arusha', 'Dodoma', 'Mwanza', 'Tabora',
    'Mbeya', 'Morogoro', 'Tanga', 'Kigoma', 'Shinyanga'
  ]
}
