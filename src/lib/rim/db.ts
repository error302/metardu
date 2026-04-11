// ============================================================
// METARDU — RIM Editor Database Schema & Types
// Resurvey and Index Map — Kenya Cadastral Document System
// Survey Act Cap 299, Survey Regulations L.N. 168/1994
// ============================================================

import db from '@/lib/db'

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

export async function createRimTables(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS rim_sections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      project_id UUID NOT NULL,
      section_name TEXT NOT NULL DEFAULT '',
      registry TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      map_sheet_number TEXT NOT NULL DEFAULT '',
      scale TEXT NOT NULL DEFAULT '1:2500',
      datum TEXT NOT NULL DEFAULT 'Arc 1960',
      projection TEXT NOT NULL DEFAULT 'UTM Zone 37S',
      total_area DOUBLE PRECISION NOT NULL DEFAULT 0,
      parcels_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'review', 'approved')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_rim_sections_user_id
      ON rim_sections(user_id);
    CREATE INDEX IF NOT EXISTS idx_rim_sections_project_id
      ON rim_sections(project_id);
    CREATE INDEX IF NOT EXISTS idx_rim_sections_status
      ON rim_sections(status);
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS rim_parcels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rim_section_id UUID NOT NULL
        REFERENCES rim_sections(id) ON DELETE CASCADE,
      parcel_number TEXT NOT NULL DEFAULT '',
      area DOUBLE PRECISION NOT NULL DEFAULT 0,
      land_use TEXT NOT NULL DEFAULT '',
      owner_name TEXT NOT NULL DEFAULT '',
      beacon_count INTEGER NOT NULL DEFAULT 0,
      northings DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
      eastings DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
      is_landmark BOOLEAN NOT NULL DEFAULT false
    );

    CREATE INDEX IF NOT EXISTS idx_rim_parcels_section_id
      ON rim_parcels(rim_section_id);
    CREATE INDEX IF NOT EXISTS idx_rim_parcels_number
      ON rim_parcels(parcel_number);
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS rim_beacons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rim_section_id UUID NOT NULL
        REFERENCES rim_sections(id) ON DELETE CASCADE,
      beacon_number TEXT NOT NULL DEFAULT '',
      easting DOUBLE PRECISION NOT NULL DEFAULT 0,
      northing DOUBLE PRECISION NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'Pillar',
      survey_status TEXT NOT NULL DEFAULT 'Original'
    );

    CREATE INDEX IF NOT EXISTS idx_rim_beacons_section_id
      ON rim_beacons(rim_section_id);
    CREATE INDEX IF NOT EXISTS idx_rim_beacons_number
      ON rim_beacons(beacon_number);
  `)

  console.log('[rim] Database tables created or already exist.')
}
