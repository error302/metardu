/** Normalize EPSG codes and legacy GeoJSON EPSG URNs to a comparable code. */
export function normalizeSchemeCrsCode(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  if (!normalized) return null

  const epsgCode = normalized.match(/(?:^EPSG:|EPSG::)(\d+)$/i)?.[1]
  return epsgCode ? `EPSG:${epsgCode}` : normalized.toUpperCase()
}

/** Fail closed when map coordinates do not declare the project's CRS. */
export function requireMatchingSchemeCrs(sourceCrs: string, projectCrs: string): string {
  const source = normalizeSchemeCrsCode(sourceCrs)
  const project = normalizeSchemeCrsCode(projectCrs)
  if (!source || !project || source !== project) {
    throw new Error(`Scheme data CRS does not match the project's declared survey CRS (${projectCrs}).`)
  }
  return project
}
