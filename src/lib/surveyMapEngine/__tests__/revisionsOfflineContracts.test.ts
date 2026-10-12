/**
 * Phase 5b contracts: design revisions, registered exports, offline field.
 *
 * These pin the three gaps that still pushed a surveyor out of the app:
 *   1. revisions were a timestamp in disguise, so no document could name the
 *      design it came from;
 *   2. the deed-plan, scheme and topo exports issued documents that were never
 *      registered, so re-issuing one destroyed the previous copy silently;
 *   3. offline maps 404'd and a recorded stake vanished with the signal.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8')

describe('design revisions are real records (blueprint §28)', () => {
  const migration = read('src/lib/db/migrations/076_design_revisions_and_offline_basemaps.sql')
  const writer = read('src/lib/engineering/designRevisions.ts')
  const compute = read('src/app/api/project/[id]/field-to-finish/route.ts')
  const alignment = read('src/app/api/engineering/alignment/route.ts')

  test('the schema stores a numbered, superseding, hashed revision', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS design_revisions/)
    expect(migration).toMatch(/revision\s+VARCHAR\(20\) NOT NULL/)
    expect(migration).toMatch(/revision_number\s+INTEGER NOT NULL/)
    expect(migration).toMatch(/supersedes_id\s+UUID REFERENCES design_revisions/)
    expect(migration).toMatch(/content_hash\s+VARCHAR\(128\)/)
    expect(migration).toMatch(/source_revision\s+VARCHAR\(60\)/)
  })

  test('a revision is immutable and only one stays live per entity', () => {
    expect(migration).toMatch(/design_revisions are append-only/)
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON design_revisions/)
    expect(migration).toMatch(/idx_design_revisions_current/)
    expect(migration).toMatch(/current_design_revisions/)
  })

  test('the writer increments, supersedes and emits evidence', () => {
    expect(writer).toMatch(/revisionNumber = \(previous\?\.revision_number \?\? 0\) \+ 1/)
    expect(writer).toMatch(/R\$\{String\(revisionNumber\)\.padStart\(2, '0'\)\}/)
    expect(writer).toMatch(/UPDATE design_revisions\s+\s*SET status = 'SUPERSEDED'/)
    expect(writer).toMatch(/eventType: 'DERIVED'/)
  })

  test('the compute path issues a real data revision, not a timestamp', () => {
    expect(compute).toMatch(/recordDesignRevision\(\{/)
    expect(compute).toMatch(/entityType: 'boundary'/)
    // The legacy token may still be read, but it is labelled, not called a revision.
    expect(compute).toMatch(/legacy:\$\{project\.revision\}/)
    expect(compute).toMatch(/inputVersion: dataRevision/)
    expect(compute).toMatch(/designRevision: boundaryRevision\.revision\.revision/)
    expect(compute).toMatch(/db\.transaction/)
  })

  test('an alignment edit is a revision and its conflict target matches the schema', () => {
    expect(alignment).toMatch(/recordDesignRevision\(\{/)
    expect(alignment).toMatch(/discipline: 'road'/)
    // 076 indexes (project_id, road_name); the upsert must target the same key
    // or every save 500s on the conflict clause.
    expect(alignment).toMatch(/ON CONFLICT \(project_id, road_name\)/)
  })
})

describe('every export path registers its deliverable (blueprint §15)', () => {
  const deedPlan = read('src/app/api/documents/deed-plan/route.ts')
  const schemeDxf = read('src/app/api/scheme/export/dxf/route.ts')
  const topoDxf = read('src/app/api/topo/export/dxf/route.ts')
  const topoShp = read('src/app/api/topo/export/shapefile/route.ts')

  test('the deed plan is registered instead of being an orphan PDF', () => {
    expect(deedPlan).toMatch(/registerDeliverable\(\{/)
    expect(deedPlan).toMatch(/documentType: 'deed_plan'/)
    expect(deedPlan).toMatch(/sourceRevision: input\.titleData\?\.revision/)
    // A register outage must be visible, not silent.
    expect(deedPlan).toMatch(/register_warning/)
  })

  test('scheme and topo exports register against their source revision', () => {
    expect(schemeDxf).toMatch(/registerDeliverable\(\{/)
    expect(schemeDxf).toMatch(/currentDesignRevision\(projectId, 'scheme_boundary'\)/)
    expect(topoDxf).toMatch(/registerDeliverable\(\{/)
    expect(topoDxf).toMatch(/currentDesignRevision\(String\(projectId\), 'surface'\)/)
    expect(topoShp).toMatch(/registerDeliverable\(\{/)
    // A failed registration never blocks the download, but is signalled.
    expect(schemeDxf).toMatch(/X-Metardu-Register-Warning/)
    expect(topoDxf).toMatch(/X-Metardu-Register-Warning/)
  })
})

describe('offline field capture (blueprint §18.1)', () => {
  const upload = read('src/app/api/field/mbtiles/upload/route.ts')
  const tileRoute = read('src/app/api/field/mbtiles/tiles/[key]/[z]/[x]/[y]/route.ts')
  const tileKeyMigration = read('src/lib/db/migrations/082_offline_basemap_storage_keys.sql')
  const queue = read('src/lib/field/setoutQueue.ts')
  const screen = read('src/app/field/setout/page.tsx')

  test('the MBTiles upload route exists (the client always posted to it)', () => {
    expect(upload).toMatch(/api\/field\/mbtiles\/upload/)
    expect(upload).toMatch(/export const POST/)
    expect(upload).toMatch(/MBTiles file is required/)
    expect(upload).toMatch(/field_basemaps/)
    expect(upload).toMatch(/path\.join\(process\.cwd\(\), 'upload', 'mbtiles'\)/)
  })

  test('server tiles require an authenticated owner and cannot be CDN cached', () => {
    expect(upload).toMatch(/ctx\.userId/)
    expect(upload).toMatch(/storage_key/)
    expect(tileRoute).toMatch(/auth:\s*true/)
    expect(tileRoute).toMatch(/storage_key\s*=\s*\$1::uuid\s+AND\s+user_id\s*=\s*\$2::uuid/)
    expect(tileRoute).toMatch(/path\.join\(process\.cwd\(\), 'upload', 'mbtiles'\)/)
    expect(tileRoute).toMatch(/private, no-store/)
    expect(tileRoute).not.toMatch(/public,\s*max-age/)
    expect(tileKeyMigration).toMatch(/ADD COLUMN IF NOT EXISTS storage_key UUID/)
    expect(tileKeyMigration).toMatch(/-- DOWN/)
  })

  test('the MBTiles upload path is server-backed until a browser reader is available', () => {
    expect(upload).toMatch(/storageRaw !== null && storageRaw !== 'server'/)
    expect(upload).toMatch(/Device-offline packages are not available yet/)
    expect(tileRoute).toMatch(/const tmsY = 2 \*\* zoom - 1 - xyzY/)
  })

  test('a recorded stake is written to the device before it is sent', () => {
    expect(queue).toMatch(/saveShotLocally/)
    expect(queue).toMatch(/deliverShot/)
    expect(queue).toMatch(/flushQueuedShots/)
    expect(queue).toMatch(/pendingShotCount/)
    expect(screen).toMatch(/saveShotLocally\(\{/)
    expect(screen).toMatch(/deliverShot\(local\)/)
  })

  test('queued work flushes when signal returns, and stays visible meanwhile', () => {
    expect(screen).toMatch(/addEventListener\('online'/)
    expect(screen).toMatch(/flushQueuedShots\(projectId\)/)
    expect(screen).toMatch(/only on this device/)
  })
})
