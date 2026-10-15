import type { EngineeringScheduleSection } from './engineeringSchedulePdf'

/** Keep the machine schedule complete; split only the wide printed curve table. */
export function roadSchedulePdfSections(schedules: Array<{ name: string; headers: string[]; rows: unknown[][] }>): EngineeringScheduleSection[] {
  return schedules.map(schedule => {
    const section: EngineeringScheduleSection = { title: schedule.name.replace(/ CSV$/, ''),
      headers: schedule.headers.map(header => header.replaceAll('_', ' ')), rows: schedule.rows, decimalPlaces: 3 }
    if (schedule.headers.includes('Curve_type')) {
      const stationing = new Set(['PI', 'Chainage_TC_m', 'Chainage_MC_m', 'Chainage_CT_m', 'Chainage_TS_m', 'Chainage_SC_m', 'Chainage_CS_m', 'Chainage_ST_m', 'Declared_CRS', 'Issue_status'])
      section.columnGroups = [
        schedule.headers.flatMap((header, index) => !stationing.has(header) || header === 'PI' ? [index] : []),
        schedule.headers.flatMap((header, index) => stationing.has(header) ? [index] : []),
      ]
    }
    return section
  })
}
