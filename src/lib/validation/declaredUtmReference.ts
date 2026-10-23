import { z } from 'zod'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'

/** For legacy UTM records outside a project: require an explicit registered CRS.
 * Redundant metadata may confirm it, but must never contradict the authority.
 * This validates the declaration, not field accuracy or jurisdictional adoption.
 */
export const declaredUtmReferenceSchema = z.object({
  epsg_code: z.string().trim().min(1).max(100),
  utm_zone: z.number().int().min(1).max(60).optional(),
  hemisphere: z.enum(['N', 'S']).optional(),
  datum: z.string().trim().min(1).max(50).optional(),
}).transform((value, ctx) => {
  try {
    const info = assertProjectedCrs(value.epsg_code)
    if (info.units !== 'metres' || info.zone === undefined || info.hemisphere === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['epsg_code'], message: 'This record requires a registered UTM reference in metres.' })
      return z.NEVER
    }
    let consistent = true
    const conflict = (field: string) => {
      consistent = false
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} contradicts the declared ${info.code} reference.` })
    }
    if (value.utm_zone !== undefined && value.utm_zone !== info.zone) conflict('utm_zone')
    if (value.hemisphere !== undefined && value.hemisphere !== info.hemisphere) conflict('hemisphere')
    const datumKey = (datum: string) => datum.toLowerCase().replace(/[\s_-]+/g, '')
    if (value.datum !== undefined && datumKey(value.datum) !== datumKey(info.datum)) conflict('datum')
    if (!consistent) return z.NEVER
    return { epsg_code: info.code, utm_zone: info.zone, hemisphere: info.hemisphere, datum: info.datum }
  } catch (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['epsg_code'], message: error instanceof Error ? error.message : 'Invalid coordinate reference.' })
    return z.NEVER
  }
})
