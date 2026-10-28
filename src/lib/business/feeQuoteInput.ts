import { z } from 'zod'
import type { FeeQuoteInput } from './surveyFeeCalculator'

/** Validate the public quotation boundary before any arithmetic or PDF output. */
export const feeQuoteInputSchema = z.object({
  category: z.enum(['cadastral_subdivision', 'boundary_reestablishment', 'topographic_survey', 'engineering_road', 'title_survey']),
  areaValue: z.number().finite().nonnegative(),
  areaUnit: z.enum(['ha', 'acres']),
  resultantPlots: z.number().int().nonnegative(),
  beaconsToSet: z.number().int().nonnegative(),
  distanceKm: z.number().finite().nonnegative(),
  currency: z.enum(['KES', 'USD', 'EUR', 'GBP', 'TZS', 'UGX']),
  includeVat: z.boolean(),
  customMarkupPercent: z.number().finite().optional(),
  clientName: z.string().optional(), projectName: z.string().optional(),
  lrNumber: z.string().optional(), surveyorName: z.string().optional(),
  firmName: z.string().optional(), iskNumber: z.string().optional(),
}) satisfies z.ZodType<FeeQuoteInput>
