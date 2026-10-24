/**
 * Topographic surface persistence (blueprint §8.5, §19, §28).
 *
 * The failure this prevents: a surveyor's breaklines, TIN and contours lived
 * in React state, so a refresh silently discarded the day's work. These
 * contracts pin that a surface is now a stored, revisioned, immutable record
 * whose geometry is computed and persisted server-side.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8')

describe('topographic surfaces are a revisioned record', () => {
  const migration = read('src/lib/db/migrations/074_topo_surface_persistence.sql')

  test('surfaces, revisions, contour sets and breaklines all persist', () => {
    for (const table of ['surfaces', 'surface_revisions', 'contour_sets', 'breaklines']) {
      expect(migration).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`))
    }
  })

  test('a revision records how the surface was produced', () => {
    expect(migration).toMatch(/algorithm\s+VARCHAR\(80\) NOT NULL/)
    expect(migration).toMatch(/parameters\s+JSONB/)
    expect(migration).toMatch(/input_hash\s+VARCHAR\(128\)/)
    expect(migration).toMatch(/triangle_count/)
    expect(migration).toMatch(/UNIQUE \(surface_id, revision\)/)
  })

  test('computed geometry is immutable evidence', () => {
    expect(migration).toMatch(/surface_revisions are append-only/)
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON surface_revisions/)
    expect(migration).toMatch(/contour sets tied to a computed revision are immutable/)
  })

  test('a surface cannot be issued without a stated CRS or a named status', () => {
    expect(migration).toMatch(/crs\s+VARCHAR\(32\)/)
    expect(migration).toMatch(/'DRAFT', 'COMPUTED', 'REVIEW_REQUIRED', 'APPROVED', 'SUPERSEDED'/)
  })
})

describe('surfaces are computed and stored server-side', () => {
  const route = read('src/app/api/project/[id]/surfaces/route.ts')
  const page = read('src/app/project/[id]/topo/page.tsx')

  test('the route builds the TIN and contours on the server', () => {
    expect(route).toMatch(/buildBreaklineTIN\(/)
    expect(route).toMatch(/generateTINContours\(/)
    expect(route).toMatch(/INSERT INTO surface_revisions/)
    expect(route).toMatch(/INSERT INTO contour_sets/)
  })

  test('an undeclared project CRS refuses to compute', () => {
    expect(route).toMatch(/CRS_UNDECLARED/)
    expect(route).toMatch(/resolveStageReference/)
  })

  test('recomputing adds a revision rather than replacing geometry', () => {
    expect(route).not.toMatch(/UPDATE surface_revisions/)
    expect(route).toMatch(/current_revision_id\s*=\s*\$2/)
  })

  test('the topo page persists selected source and loads an exact retained revision', () => {
    expect(page).toMatch(/pointIds: \[\.\.\.selected\]/)
    expect(page).toMatch(/expectedReferenceHash: source.referenceHash/)
    expect(page).toMatch(/loadRevision/)
    expect(page).toMatch(/contourRevision=/)
    expect(page).toMatch(/surfaceRevisionId: revisionId/)
    // The browser no longer owns the interpolation.
    expect(page).not.toMatch(/computeIDW\(/)
    expect(page).not.toMatch(/generateContours\(/)
  })
})
