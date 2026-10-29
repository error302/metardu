import { z } from 'zod'

export const scheduleStatusSchema = z.enum(['upcoming','in_progress','completed','cancelled'])
export const reminderMinutesSchema = z.array(z.number().int().min(0).max(20160)).max(5)
  .refine(value => new Set(value).size === value.length, 'Choose each reminder once')
export function isTimeZone(value: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return true } catch { return false }
}
const timeZone = z.string().min(1).max(100).refine(isTimeZone, 'Choose a valid time zone')
const fields = {
  project_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(4000).default(''),
  location: z.string().trim().max(300).default(''),
  starts_at: z.string().datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)), 'Choose a valid start time'),
  time_zone: timeZone,
  duration_minutes: z.number().int().min(15).max(1440),
  reminder_minutes: reminderMinutesSchema,
}
export const scheduleCreateSchema = z.object({ request_id: z.string().uuid(), ...fields }).strict()
export const scheduleUpdateSchema = z.object({
  version: z.number().int().positive(),
  project_id: fields.project_id.optional(),
  title: fields.title.optional(),
  notes: z.string().max(4000).optional(),
  location: z.string().trim().max(300).optional(),
  starts_at: fields.starts_at.optional(),
  time_zone: fields.time_zone.optional(),
  duration_minutes: fields.duration_minutes.optional(),
  reminder_minutes: fields.reminder_minutes.optional(),
  status: scheduleStatusSchema.optional(),
}).strict().refine(value => Object.keys(value).length > 1, 'Choose a change to save')
export const scheduleSchema = z.object({
  id: z.string().uuid(), project_id: z.string().uuid().nullable(),
  project_name: z.string().nullable(), title: z.string(), notes: z.string(), location: z.string(),
  starts_at: z.string().datetime(), time_zone: z.string(), duration_minutes: z.number().int(),
  reminder_minutes: z.array(z.number().int()), status: scheduleStatusSchema,
  version: z.number().int(), created_at: z.string().datetime(), updated_at: z.string().datetime(),
  can_collect: z.boolean(),
})
export const schedulesResponseSchema = z.object({ schedules: z.array(scheduleSchema), hasMore: z.boolean() })
export const scheduleResponseSchema = z.object({ schedule: scheduleSchema })
export const scheduleProjectsResponseSchema = z.object({ hasMore: z.boolean(), projects: z.array(z.object({
  id: z.string().uuid(), name: z.string(), location: z.string().nullable(),
  survey_type: z.string().nullable(), can_collect: z.boolean(),
})) })
export type SurveySchedule = z.infer<typeof scheduleSchema>
export type ScheduleCreate = z.infer<typeof scheduleCreateSchema>
export type ScheduleUpdate = z.infer<typeof scheduleUpdateSchema>
export type ScheduleProject = z.infer<typeof scheduleProjectsResponseSchema>['projects'][number]
export const collectorUrl = (projectId: string) => '/field/collect?projectId=' + encodeURIComponent(projectId)
export const projectUrl = (projectId: string) => '/project/' + encodeURIComponent(projectId)

export function formatScheduleTime(value: string, zone: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(new Date(value))
}
export function localDateTime(value?: string) {
  const date = value ? new Date(value) : new Date()
  const pad = (n: number) => String(n).padStart(2,'0')
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes())
}
/** Device-local input has an explicit recorded zone; reject DST gaps/ambiguity. */
export function localInputToInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Choose a valid date and time')
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || localDateTime(date.toISOString()) !== value) throw new Error('That local time does not exist. Choose another time.')
  if ([-86400000,-10800000,-7200000,-5400000,-3600000,-2700000,-1800000,-900000,900000,1800000,2700000,3600000,5400000,7200000,10800000,86400000].some(offset => localDateTime(new Date(date.getTime()+offset).toISOString()) === value))
    throw new Error('That local time occurs twice because clocks change. Choose an unambiguous time.')
  return date.toISOString()
}
