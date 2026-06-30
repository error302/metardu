import { z } from 'zod';

// ponytail: response schemas — Phase 4 wave 2 will move these to src/lib/api/schemas/

export const authSessionSchema = z.object({
  user: z.any().optional(),
  expires: z.string().optional(),
}).passthrough()

export const projectsListSchema = z.object({
  data: z.array(z.any()),
}).passthrough()

export const rimListSchema = z.object({
  data: z.array(z.any()),
}).passthrough()

export const rimTemplatesListSchema = z.object({
  data: z.any(),
}).passthrough()

// Most /api/rim mutations return { data: <created-or-updated-row> }
export const rimMutationSchema = z.object({
  data: z.any(),
}).passthrough()

export const rimTemplateApplySchema = z.object({
  data: z.any(),
}).passthrough()

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  survey_type?: string;
  location?: string;
}

export interface RimSection {
  id: string;
  user_id: string;
  project_id: string;
  section_name: string;
  registry: string;
  district: string;
  map_sheet_number: string;
  scale: string;
  datum: string;
  projection: string;
  total_area: number;
  parcels_count: number;
  status: 'draft' | 'review' | 'approved';
  notes: string;
  created_at: string;
  updated_at: string;
  parcel_count?: number;
  beacon_count?: number;
}

export interface RimParcel {
  id: string;
  rim_section_id: string;
  parcel_number: string;
  area: number;
  land_use: string;
  owner_name: string;
  beacon_count: number;
  northings: number[];
  eastings: number[];
  is_landmark: boolean;
}

export interface RimBeacon {
  id: string;
  rim_section_id: string;
  beacon_number: string;
  easting: number;
  northing: number;
  description: string;
  type: string;
  survey_status: string;
}

export interface RimTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  defaults: {
    datum: string;
    projection: string;
    scale: string;
    registry: string;
  };
  parcelCount: number;
  beaconCount: number;
  regulationReference: string;
}

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

export const categoryColors: Record<string, string> = {
  urban: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  agricultural: 'bg-green-500/10 text-green-400 border-green-500/30',
  pastoral: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  institutional: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  coastal: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  special: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
};

export const statusStyles: Record<string, string> = {
  draft: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  review: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  approved: 'bg-green-500/10 text-green-400 border-green-500/30',
};

export const statusLabels: Record<string, string> = {
  draft: 'Draft',
  review: 'In Review',
  approved: 'Approved',
};

export const beaconTypes = ['Pillar', 'Pin', 'Mark', 'Pipe', 'Concrete Block'];
export const surveyStatuses = ['Original', 'Found', 'Not Found', 'Replaced'];
