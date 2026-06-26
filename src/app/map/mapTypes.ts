/**
 * Map types — re-exports from the canonical definitions in @/hooks/useMapTypes
 *
 * This file exists for backward compatibility: many map components import
 * from @/app/map/mapTypes, but the canonical type definitions live in
 * @/hooks/useMapTypes to avoid duplication.
 */

export type { BasemapMode, DrawMode, MeasureMode, PopupData } from '@/hooks/useMapTypes'
