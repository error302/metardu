/**
 * Phase 2 tests — unified selection store (plan Phase 2 exit: "selecting a
 * point in any surface updates the same store shape").
 */
import {
  useSelectionStore,
  selectSelection,
  selectSelectionKind,
  selectHasSelection,
  type Selection,
} from '@/lib/surveyMapEngine/ol/selection';

const featureSelection: Selection = { kind: 'feature', surface: 'map', id: 'pt-1', name: 'BM101' };
const beaconSelection: Selection = { kind: 'beacon', surface: 'project-map', label: 'A12', easting: 500000.125, northing: 9600000.5 };
const stationSelection: Selection = { kind: 'station', surface: 'workspace', ids: ['T1'] };

beforeEach(() => {
  useSelectionStore.getState().clearSelection();
});

describe('unified selection store (Phase 2)', () => {
  test('starts empty', () => {
    const state = useSelectionStore.getState();
    expect(state.selection).toEqual({ kind: 'none' });
    expect(selectSelectionKind(state)).toBe('none');
    expect(selectHasSelection(state)).toBe(false);
  });

  test.each([
    ['feature', featureSelection],
    ['beacon', beaconSelection],
    ['station', stationSelection],
  ])('%s selection from any surface updates the shared store shape', (_name, selection) => {
    useSelectionStore.getState().setSelection(selection);
    const state = useSelectionStore.getState();
    expect(state.selection).toEqual(selection);
    expect(selectSelection(state)).toEqual(selection);
    expect(selectSelectionKind(state)).toBe(selection.kind);
    expect(selectHasSelection(state)).toBe(true);
  });

  test('a later surface write replaces the previous selection (single slot)', () => {
    useSelectionStore.getState().setSelection(featureSelection);
    useSelectionStore.getState().setSelection(stationSelection);
    expect(useSelectionStore.getState().selection).toEqual(stationSelection);
  });

  test('clearSelection empties the store regardless of surface', () => {
    useSelectionStore.getState().setSelection(beaconSelection);
    useSelectionStore.getState().clearSelection();
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'none' });
  });

  test('clearSelectionFrom clears only the owning surface', () => {
    useSelectionStore.getState().setSelection(featureSelection);
    useSelectionStore.getState().clearSelectionFrom('workspace');
    expect(useSelectionStore.getState().selection).toEqual(featureSelection);
    useSelectionStore.getState().clearSelectionFrom('map');
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'none' });
  });

  test('clearSelectionFrom after another surface took over leaves it intact', () => {
    useSelectionStore.getState().setSelection(featureSelection);
    useSelectionStore.getState().setSelection(stationSelection);
    useSelectionStore.getState().clearSelectionFrom('map');
    expect(useSelectionStore.getState().selection).toEqual(stationSelection);
  });

  test('clearSelectionFrom on an empty store is a no-op', () => {
    useSelectionStore.getState().clearSelectionFrom('project-map');
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'none' });
  });

  test('subscribeWithSelector fires when the selection kind changes', () => {
    const seen: string[] = [];
    const unsubscribe = useSelectionStore.subscribe(selectSelectionKind, (kind) => seen.push(kind));
    useSelectionStore.getState().setSelection(beaconSelection);
    unsubscribe();
    expect(seen).toEqual(['beacon']);
  });

  test('works outside React via getState()', () => {
    useSelectionStore.getState().setSelection(stationSelection);
    expect(useSelectionStore.getState().selection.kind).toBe('station');
    useSelectionStore.getState().clearSelectionFrom('workspace');
    expect(useSelectionStore.getState().selection.kind).toBe('none');
  });
});
