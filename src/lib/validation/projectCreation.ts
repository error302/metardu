import { z } from 'zod'
import { horizontalCrsFor } from '@/lib/spatial/projectReferenceSystem'
import { resolveEpsg } from '@/lib/spatial/projectCrs'
import { mapDrawingSchema, reconnaissanceDrawingSchema } from './mapDrawing'

/** New projects may be prepared without a reference; partial declarations are rejected. */
export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required'),
  survey_type: z.string().min(1, 'Survey type is required'),
  location: z.string().optional().default(''),
  utm_zone: z.number().int().min(1).max(60).nullish(),
  hemisphere: z.enum(['N', 'S']).nullish(),
  datum: z.string().trim().nullish().transform(value => value || null),
  project_type: z.enum(['small', 'scheme']).optional().default('small'),
  client_name: z.string().optional(), surveyor_name: z.string().optional(), country: z.string().optional(),
  scheme_number: z.string().optional(), county: z.string().optional(), sub_county: z.string().optional(), ward: z.string().optional(),
  planned_parcels: z.number().int().nonnegative().optional(), adjudication_section: z.string().optional(),
  boundary_data: z.union([mapDrawingSchema, reconnaissanceDrawingSchema]).optional(),
}).strict().superRefine((project, context) => {
  const { datum, utm_zone: zone, hemisphere } = project
  if (datum == null && zone == null && hemisphere == null && project.boundary_data?.source !== 'map-drawing') return
  if (!datum || zone == null || hemisphere == null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['datum'], message: 'Declare datum, UTM zone and hemisphere together, or leave the reference unset.' })
    return
  }
  try {
    const info = resolveEpsg(horizontalCrsFor(datum, zone, hemisphere))
    if (!info.projected || info.displayOnly || info.units !== 'metres') throw new Error('Not a survey grid')
    if (project.boundary_data?.source === 'map-drawing' && project.boundary_data.measurementCrs !== info.code) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['boundary_data', 'measurementCrs'], message: 'Drawing measurements must state the selected project grid.' })
    }
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['datum'], message: 'This datum, zone and hemisphere do not identify a supported projected metre grid. Set the full project reference in settings.' })
  }
})
