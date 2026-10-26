import { roadWorkbenchExample } from "../roadWorkbenchExample";
import {
  createRoadWorkbenchDraft,
  evaluateRoadWorkbenchDraft,
} from "../roadWorkbenchDraft";
import {
  roadWorkbenchSection,
  buildRoadWorkbenchModel,
} from "../roadWorkbench";
import { calculateRoadQuantityRun } from "../roadQuantity";
import { buildRoadSchedules } from "../roadProjectOutputs";
import { buildRoadLongSection } from "../roadLongSection";

const example = () => roadWorkbenchExample();
it("evaluates changed geometry with shared engines without modifying ground observations or the source", () => {
  const { road, reference } = example();
  const before = JSON.stringify(road);
  const draft = createRoadWorkbenchDraft(road);
  draft.ips[0].easting = "499999";
  draft.vips[0].reducedLevel = "99";
  draft.template.camber = "3";
  const result = evaluateRoadWorkbenchDraft(road, draft, reference);
  expect(result.error).toBe("");
  expect(result.road?.ips[0].easting).toBe(499999);
  expect(result.model?.plan[0].easting).toBe(499999);
  expect(result.model?.profile[0].elevation).toBe(99);
  expect(result.road?.crossSectionTemplate.camber).toBe(3);
  expect(result.road?.stations).toEqual(road.stations);
  expect(JSON.stringify(road)).toBe(before);
});
it.each(["", " ", "1e", "0x10", "Infinity", "12 metres"])(
  "retains incomplete text %p without substituting a coordinate or displaying the old design",
  (text) => {
    const { road, reference } = example();
    const draft = createRoadWorkbenchDraft(road);
    draft.ips[0].easting = text;
    const result = evaluateRoadWorkbenchDraft(road, draft, reference);
    expect(result.road).toBeNull();
    expect(result.model).toBeNull();
    expect(result.error).toMatch(/Easting.*finite decimal/i);
    expect(draft.ips[0].easting).toBe(text);
  },
);
it("refuses out-of-range stations after a horizontal edit instead of moving measured observations", () => {
  const { road, reference } = example();
  const draft = createRoadWorkbenchDraft(road);
  draft.ips[1].radius = "50";
  const result = evaluateRoadWorkbenchDraft(road, draft, reference);
  expect(result.error).toMatch(/measured section.*outside/i);
  expect(result.model).toBeNull();
  expect(road.stations.at(-1)?.chainage).toBeGreaterThan(220);
});
it("drops stale computed caches while preserving manual targets and original evidence", () => {
  const { road, reference } = example();
  road.horizontalAlignment = [];
  road.verticalAlignment = [];
  road.earthworksTable = [];
  road.ips[1].tangentLength = 999;
  road.vips[1].gradientIn = 999;
  road.stations[0] = {
    ...road.stations[0],
    designLevelSource: "manual",
    designLevel: 0,
    cutArea: 999,
    fillArea: 999,
  };
  road.stations[1].designLevel = 999;
  const result = evaluateRoadWorkbenchDraft(
    road,
    createRoadWorkbenchDraft(road),
    reference,
  );
  expect(result.error).toBe("");
  expect(result.road).not.toHaveProperty("horizontalAlignment");
  expect(result.road).not.toHaveProperty("verticalAlignment");
  expect(result.road).not.toHaveProperty("earthworksTable");
  expect(result.road?.ips[1]).not.toHaveProperty("tangentLength");
  expect(result.road?.vips[1]).not.toHaveProperty("gradientIn");
  expect(result.road?.stations[0].designLevel).toBe(0);
  expect(result.road?.stations[0]).not.toHaveProperty("cutArea");
  expect(result.road?.stations[1]).not.toHaveProperty("designLevel");
  expect(result.road?.stations[0].groundProfile).toEqual(
    road.stations[0].groundProfile,
  );
});
it("accepts zero dimensions where valid, leaves optional values unknown and rejects a conflicting vertical curve", () => {
  const { road, reference } = example();
  const draft = createRoadWorkbenchDraft(road);
  draft.template.shoulderWidth = "0";
  draft.template.shoulderCrossfall = "";
  expect(evaluateRoadWorkbenchDraft(road, draft, reference).error).toBe("");
  draft.vips[1].kValue = "1";
  expect(evaluateRoadWorkbenchDraft(road, draft, reference).error).toMatch(
    /conflict/i,
  );
});
it("binds measured sections to the original alignment and withholds relocated ground and quantities after save/reload", () => {
  const { road, reference } = example();
  const draft = createRoadWorkbenchDraft(road);
  draft.ips[0].easting = "499999";
  const edited = evaluateRoadWorkbenchDraft(road, draft, reference);
  expect(edited.road).not.toBeNull();
  const persisted = JSON.parse(JSON.stringify(edited.road)) as typeof road;
  expect(() => calculateRoadQuantityRun(persisted, reference)).toThrow(
    /ground sections.*alignment/i,
  );
  const model = buildRoadWorkbenchModel(persisted, reference);
  expect(model.plan.length).toBeGreaterThan(0);
  expect(model.quantity).toBeNull();
  expect(model.stations).toHaveLength(0);
  const section = roadWorkbenchSection(model, 20);
  expect(section.ground).toHaveLength(0);
  expect(section.worldGround).toHaveLength(0);
  expect(section.cutArea).toBeNull();
  expect(section.target).not.toBeNull();
  const schedules = buildRoadSchedules(
    persisted,
    reference.code,
    reference.verticalDatum,
  );
  expect(schedules.earthworks.rows).toHaveLength(0);
  expect(schedules.profiles.rows).toHaveLength(0);
  expect(schedules.stationLevels.rows).toHaveLength(0);
  expect(buildRoadLongSection(persisted).ground).toHaveLength(0);
  expect(schedules.issues.join(" ")).toMatch(/ground sections.*alignment/i);
  expect(persisted.stations[0].groundProfile).toEqual(
    road.stations[0].groundProfile,
  );
  const restored = createRoadWorkbenchDraft(persisted);
  restored.ips[0].easting = "500000";
  const originalGeometry = evaluateRoadWorkbenchDraft(
    persisted,
    restored,
    reference,
  );
  expect(originalGeometry.model?.quantity).not.toBeNull();
});
it("does not silently clear contradictory saved transition lengths", () => {
  const { road, reference } = example();
  road.ips[1].hasTransition = false;
  expect(
    evaluateRoadWorkbenchDraft(road, createRoadWorkbenchDraft(road), reference)
      .error,
  ).toMatch(/conflict.*disabled/i);
});
