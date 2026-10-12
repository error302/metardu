/**
 * SurveyMapEngine unified selection store (plan §3.1 / Phase 2).
 *
 * One store shape for selections made on any map surface:
 *   - 'map'          /map (MapClient: drawn / identified features)
 *   - 'project-map'  /project/[id]/map (SurveyMap beacon clicks)
 *   - 'workspace'    workspace stage (OL station select + grid bridge)
 *
 * Surfaces keep their existing local state/context for their own consumers
 * (consumer rewiring is Phase 5); each surface mirrors its selection writes
 * here and clears only through `clearSelectionFrom(surface)`, so one surface
 * can never wipe another surface's selection.
 *
 * Zero React beyond zustand — callable from plain handlers via
 * `useSelectionStore.getState()`.
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

/** Which surface wrote the current selection. */
export type SelectionSurface = 'map' | 'project-map' | 'workspace';

export type Selection =
  | { kind: 'none' }
  | { kind: 'feature'; surface: SelectionSurface; id: string | null; name: string }
  | { kind: 'beacon'; surface: SelectionSurface; label: string; easting: number; northing: number }
  | { kind: 'station'; surface: SelectionSurface; ids: string[] };

export interface SelectionState {
  selection: Selection;
  setSelection: (selection: Selection) => void;
  clearSelection: () => void;
  /** Clear only if the current selection was written by `surface`. */
  clearSelectionFrom: (surface: SelectionSurface) => void;
}

export const useSelectionStore = create<SelectionState>()(
  subscribeWithSelector((set, get) => ({
    selection: { kind: 'none' },
    setSelection: (selection) => set({ selection }),
    clearSelection: () => set({ selection: { kind: 'none' } }),
    clearSelectionFrom: (surface) => {
      const current = get().selection;
      if (current.kind !== 'none' && current.surface === surface) {
        set({ selection: { kind: 'none' } });
      }
    },
  })),
);

export const selectSelection = (state: SelectionState): Selection => state.selection;
export const selectSelectionKind = (state: SelectionState): Selection['kind'] => state.selection.kind;
export const selectHasSelection = (state: SelectionState): boolean => state.selection.kind !== 'none';
