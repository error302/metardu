/**
 * SurveyMapEngine drawing/editing entry point (plan 3.1 / Phase 3).
 *
 * Consolidates the digitizing + cadastral editing modules that previously
 * lived outside the engine:
 *   - editingTools     (was `src/lib/map/editingTools.ts`)
 *   - cadastralEditing (was `src/lib/map/cadastralEditing.ts`)
 *   - drawAnnotations  (was `src/app/map/utils/drawAnnotations.ts`)
 *
 * The old paths are re-export shims until Phase 5; consumers should import
 * from here (or the individual modules above) instead.
 */
export * from '@/lib/surveyMapEngine/ol/editingTools';
export * from '@/lib/surveyMapEngine/ol/cadastralEditing';
export * from '@/lib/surveyMapEngine/ol/drawAnnotations';
