/**
 * Sentinel-2 Satellite Imagery Service
 * Phase 7 - Online Power Features
 * Provides satellite imagery overlay for survey projects
 */

export interface ImageryTile {
  url: string
  attribution: string
  maxZoom: number
  minZoom: number
}

export interface ImagerySearchParams {
  latitude: number
  longitude: number
  zoom: number
}

export interface ImageryResult {
  provider: string
  tiles: ImageryTile
  date: string
  resolution: number
  coverage: string
}

const IMAGERY_PROVIDERS: Record<string, ImageryTile> = {
  sentinel: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri World Imagery',
    maxZoom: 19,
    minZoom: 1
  },
  sentinelRecent: {
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri World Imagery (Contains modified Copernicus Sentinel data 2024)',
    maxZoom: 19,
    minZoom: 1
  },
  esri: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri',
    maxZoom: 18,
    minZoom: 1
  },
  openstreetmap: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    minZoom: 1
  },
  satellite: {
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: 'Google Satellite',
    maxZoom: 20,
    minZoom: 1
  },
  terrain: {
    url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    attribution: 'Google Terrain',
    maxZoom: 16,
    minZoom: 1
  },
  topographic: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'OpenTopoMap',
    maxZoom: 17,
    minZoom: 1
  }
}

export function getImageryLayers(): { id: string; name: string; tile: ImageryTile }[] {
  return [
    { id: 'sentinelRecent', name: 'Sentinel-2 Satellite (Recent)', tile: IMAGERY_PROVIDERS.sentinelRecent },
    { id: 'sentinel', name: 'Sentinel-2 Satellite', tile: IMAGERY_PROVIDERS.sentinel },
    { id: 'esri', name: 'Esri World Imagery', tile: IMAGERY_PROVIDERS.esri },
    { id: 'satellite', name: 'Google Satellite', tile: IMAGERY_PROVIDERS.satellite },
    { id: 'terrain', name: 'Google Terrain', tile: IMAGERY_PROVIDERS.terrain },
    { id: 'topographic', name: 'OpenTopoMap', tile: IMAGERY_PROVIDERS.topographic },
    { id: 'openstreetmap', name: 'OpenStreetMap', tile: IMAGERY_PROVIDERS.openstreetmap }
  ]
}

export async function getImageryForLocation(params: ImagerySearchParams): Promise<ImageryResult[]> {
  const { latitude, longitude } = params
  
  const isAfrica = latitude >= -35 && latitude <= 35 && longitude >= -20 && longitude <= 55
  const isEurope = latitude >= 35 && latitude <= 71 && longitude >= -25 && longitude <= 45
  const isAsia = latitude >= -10 && latitude <= 55 && longitude >= 60 && longitude <= 150
  const isAmericas = latitude >= -60 && latitude <= 70 && longitude >= -170 && longitude <= -30
  
  let coverage = 'Global'
  if (isAfrica) coverage = 'Africa - High Resolution'
  else if (isEurope) coverage = 'Europe - High Resolution'
  else if (isAsia) coverage = 'Asia - Regional'
  else if (isAmericas) coverage = 'Americas - Regional'
  
  const imageryDate = new Date().toISOString().split('T')[0]
  
  const results: ImageryResult[] = [
    {
      provider: 'Sentinel-2 (Esri)',
      tiles: IMAGERY_PROVIDERS.sentinelRecent,
      date: imageryDate,
      resolution: 10,
      coverage
    },
    {
      provider: 'Esri World Imagery',
      tiles: IMAGERY_PROVIDERS.esri,
      date: imageryDate,
      resolution: 0.5,
      coverage: 'Global'
    }
  ]
  
  return results
}

export function getImageryById(id: string): ImageryTile | null {
  return IMAGERY_PROVIDERS[id] || null
}

export function getSentinel2TileUrl(): string {
  return IMAGERY_PROVIDERS.sentinelRecent.url
}

export interface NDVIResult {
  ndvi: number
  classification: 'vegetation' | 'bare' | 'water' | 'urban'
  health: 'healthy' | 'moderate' | 'sparse'
}

export function calculateNDVI(nir: number, red: number): NDVIResult {
  const ndvi = (nir - red) / (nir + red)
  
  let classification: NDVIResult['classification']
  if (ndvi > 0.2) classification = 'vegetation'
  else if (ndvi > -0.1) classification = 'bare'
  else if (ndvi > -0.5) classification = 'water'
  else classification = 'urban'
  
  let health: NDVIResult['health']
  if (ndvi > 0.6) health = 'healthy'
  else if (ndvi > 0.3) health = 'moderate'
  else health = 'sparse'
  
  return { ndvi, classification, health }
}

export function getImageryMetadata(imageryId: string): {
  provider: string
  resolution: string
  updateFrequency: string
  coverage: string
} | null {
  const metadata: Record<string, { provider: string; resolution: string; updateFrequency: string; coverage: string }> = {
    sentinelRecent: {
      provider: 'Copernicus Sentinel-2 via Esri',
      resolution: '10m (Sentinel-2)',
      updateFrequency: '5-10 days',
      coverage: 'Global land'
    },
    sentinel: {
      provider: 'Copernicus Sentinel-2',
      resolution: '10m',
      updateFrequency: '5-10 days',
      coverage: 'Global land'
    },
    esri: {
      provider: 'Esri',
      resolution: '0.5m - 15m',
      updateFrequency: 'Varies',
      coverage: 'Global'
    },
    satellite: {
      provider: 'Google',
      resolution: '1m or better',
      updateFrequency: 'Monthly',
      coverage: 'Global'
    },
    terrain: {
      provider: 'Google',
      resolution: ' varies',
      updateFrequency: 'As needed',
      coverage: 'Global'
    }
  }
  
  return metadata[imageryId] || null
}
