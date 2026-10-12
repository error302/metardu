/**
 * Print surface (plan Phase 4 / §3.1 `io/`).
 *
 * THE entry-point module for map printing: thin delegation to the existing
 * `usePrint` hook family and the `SheetLayout` overlay. No print logic is
 * reimplemented here — both map surfaces reach these entries through
 * `useSurveyMapEngine()` instead of importing the generators directly.
 */

export {
  usePrint,
  PrintButton,
  PrintHeader,
  type PaperSize,
  type Orientation,
  type PrintOptions,
  type PrintButtonProps,
  type PrintHeaderProps,
} from '@/hooks/usePrint';

export type { SheetLayoutProps } from '@/components/map/SheetLayout';

/**
 * Lazily load the SheetLayout overlay component. Replaces the hand-written
 * dynamic `import('@/components/map/SheetLayout')` calls duplicated across
 * the map surfaces; the sheet chunk is loaded on demand, never eagerly.
 */
export async function loadSheetLayout(): Promise<
  typeof import('@/components/map/SheetLayout').default
> {
  const mod = await import('@/components/map/SheetLayout');
  return mod.default;
}
