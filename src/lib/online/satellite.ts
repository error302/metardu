import { z } from 'zod'

export const imageryProviderIdSchema = z.enum(['esri-world', 'nasa-modis-terra'])
export const imageryDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Use a valid calendar date')
export const imageryDateRangeSchema = z.object({ start: imageryDateSchema, end: imageryDateSchema }).refine(range => range.start <= range.end)
export type ImageryDateRange = z.infer<typeof imageryDateRangeSchema>
export const imageryViewSchema = z.object({
  latitude: z.number().finite().min(-85.0511287798066).max(85.0511287798066),
  longitude: z.number().finite().min(-180).max(180),
  zoom: z.number().int().min(0).max(20),
}).strict()
export type ImageryView = z.infer<typeof imageryViewSchema>
export const imageryProviderSchema = z.object({
  id: imageryProviderIdSchema, name: z.string(), available: z.boolean(), error: z.string().nullable(),
  tileTemplate: z.string().nullable(), tileSize: z.number().int().positive().nullable(),
  minZoom: z.number().int().min(0).nullable(), maxZoom: z.number().int().max(20).nullable(),
  dated: z.boolean(), defaultDate: imageryDateSchema.nullable(), dateRanges: z.array(imageryDateRangeSchema).max(1000),
  acquisitionDate: z.null(), sourceResolution: z.string(), credits: z.string(),
  sourceUrl: z.string().url(), termsUrl: z.string().url(), exportAllowed: z.boolean(), exportReason: z.string().nullable(),
})
export type ImageryProvider = z.infer<typeof imageryProviderSchema>
export const imageryCatalogueSchema = z.object({ retrievedAt: z.string().datetime(), providers: z.array(imageryProviderSchema).length(2) })
export type ImageryCatalogue = z.infer<typeof imageryCatalogueSchema>

/** The published calendar may contain gaps; never substitute a nearby data day. */
export function isImageryDateAvailable(date: string, ranges: ImageryDateRange[]): boolean {
  return imageryDateSchema.safeParse(date).success && ranges.some(range => date >= range.start && date <= range.end)
}

export function imageryTileTemplate(provider: ImageryProvider, date: string | null): string {
  if (!provider.available || !provider.tileTemplate) throw new Error('This imagery source is unavailable. Retry loading its metadata.')
  const expected = provider.id === 'nasa-modis-terra'
    ? 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg'
    : 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  if (provider.tileTemplate !== expected) throw new Error('The imagery source has an unapproved tile template.')
  if (provider.dated && (!date || !isImageryDateAvailable(date, provider.dateRanges))) throw new Error('The selected data day is outside the source’s published availability calendar.')
  return provider.tileTemplate.replace('{Time}', date ?? '')
}
