/**
 * Versioned Entity Types — Shared registry
 * ──────────────────────────────────────────
 * Central list of entity types that support data versioning.
 * Shared between the versions API route, the trigger function,
 * the restore route whitelist, and the version history panel.
 */

export const VERSIONED_ENTITY_TYPES = [
  'parcels',
  'blocks',
  'projects',
  'traverse_results',
  'traverse_history',
  'traverse_observations',
  'project_fieldbook_entries',
  'survey_points',
] as const

export type VersionedEntityType = (typeof VERSIONED_ENTITY_TYPES)[number]
