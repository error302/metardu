// ============================================================
// METARDU — RIM Editor Database Schema & Types
// Resurvey and Index Map — Kenya Cadastral Document System
// Survey Act Cap 299, Survey Regulations L.N. 168/1994
// ============================================================

// AUDIT FIX (2026-07-03): `import db from '@/lib/db'` removed —
// createRimTables() was the only function that used it, and that
// function has been deleted (tables are created by migrations).

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface RimSection {
  id: string
  user_id: string
  project_id: string
  section_name: string       // e.g. "LR 123/456 Section II"
  registry: string           // e.g. "Machakos"
  district: string           // County
  map_sheet_number: string   // e.g. "MS 1234"
  scale: string              // e.g. "1:2500"
  datum: string              // e.g. "Arc 1960"
  projection: string         // e.g. "UTM Zone 37S"
  total_area: number         // Total section area in hectares
  parcels_count: number
  status: 'draft' | 'review' | 'approved'
  notes: string
  created_at: Date
  updated_at: Date
}

export interface RimParcel {
  id: string
  rim_section_id: string
  parcel_number: string      // e.g. "123/456"
  area: number               // in hectares
  land_use: string           // e.g. "Residential", "Agricultural"
  owner_name: string
  beacon_count: number
  northings: number[]        // Array of beacon northing values
  eastings: number[]         // Array of beacon easting values
  is_landmark: boolean       // Whether this is a landmark parcel (drawn differently)
}

export interface RimBeacon {
  id: string
  rim_section_id: string
  beacon_number: string      // e.g. "A123"
  easting: number
  northing: number
  description: string        // e.g. "Concrete pillar"
  type: string               // "Pillar", "Pin", "Mark"
  survey_status: string      // "Original", "Found", "Not Found", "Replaced"
}

// ────────────────────────────────────────────────────────────
// Table Creation
// ────────────────────────────────────────────────────────────
//
// AUDIT FIX (2026-07-03): createRimTables() removed.
//
// The rim_sections, rim_parcels, and rim_beacons tables are created
// by src/lib/db/migrations/000_canonical_schema.sql and
// 035_consolidated_missing_tables.sql. Calling CREATE TABLE IF NOT
// EXISTS on every POST /api/rim request was:
//   1. A redundant DB round-trip on every write
//   2. Misleading — it implied the tables might not exist
//   3. Conflicting — the runtime CREATE didn't include the `geom`
//      column that migration 035 adds to rim_parcels/rim_beacons
//
// If you need to verify tables exist, use the migration runner
// (src/app/api/db/migrations/route.ts) instead.
//
// The function is intentionally NOT exported anymore. If external
// code depended on it, they should depend on the migration system.
