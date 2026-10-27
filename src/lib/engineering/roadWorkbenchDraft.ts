import type {
  CrossSectionTemplate,
  IntersectionPoint,
  RoadDesignData,
  VerticalIP,
} from "@/types/engineering";
import type { QuantityReference } from "./roadQuantity";
import { buildRoadWorkbenchModel } from "./roadWorkbench";
import { validateRoadTemplate } from "./roadProjectOutputs";
import {
  calculateRoadVertical,
  validateVerticalDraft,
} from "./roadVerticalAlignment";
import { roadGroundAlignmentKey } from "./roadGroundAssociation";
import {roadTerrainBindingSchema,type RoadTerrainIdentity} from './roadTerrain';

export interface RoadPiDraft {
  id: string;
  name: string;
  easting: string;
  northing: string;
  radius: string;
  hasTransition: boolean;
  transitionLengthIn: string;
  transitionLengthOut: string;
}
export interface RoadVipDraft {
  id: string;
  chainage: string;
  reducedLevel: string;
  curveLength: string;
  kValue: string;
}
export interface RoadWorkbenchDraft {
  terrainRevisionId?: string;
  terrainIntervalM?: string;
  terrainHalfWidthM?: string;
  startChainage: string;
  ips: RoadPiDraft[];
  vips: RoadVipDraft[];
  verticalStationIntervalM: string;
  template: Record<keyof CrossSectionTemplate, string>;
}
const text = (n: number | undefined) => (n == null ? "" : String(n));
export function createRoadWorkbenchDraft(
  road: RoadDesignData,
): RoadWorkbenchDraft {
  return {
    terrainRevisionId:road.retainedTerrain?.revisionId??'',
    terrainIntervalM:text(road.retainedTerrain?.intervalM??20),
    terrainHalfWidthM:text(road.retainedTerrain?.halfWidthM??20),
    startChainage: text(road.startChainage),
    ips: road.ips.map((p) => ({
      id: p.id,
      name: p.name,
      easting: text(p.easting),
      northing: text(p.northing),
      radius: text(p.radius),
      hasTransition:
        p.hasTransition ??
        (p.transitionLengthIn != null || p.transitionLengthOut != null),
      transitionLengthIn: text(p.transitionLengthIn),
      transitionLengthOut: text(p.transitionLengthOut),
    })),
    vips: road.vips.map((p) => ({
      id: p.id,
      chainage: text(p.chainage),
      reducedLevel: text(p.reducedLevel),
      curveLength: text(p.curveLength),
      kValue: text(p.kValue),
    })),
    verticalStationIntervalM: text(road.verticalStationIntervalM),
    template: {
      carriagewayWidth: text(road.crossSectionTemplate.carriagewayWidth),
      shoulderWidth: text(road.crossSectionTemplate.shoulderWidth),
      camber: text(road.crossSectionTemplate.camber),
      shoulderCrossfall: text(road.crossSectionTemplate.shoulderCrossfall),
      subgradeDepth: text(road.crossSectionTemplate.subgradeDepth),
      cutSlope: road.crossSectionTemplate.cutSlope,
      fillSlope: road.crossSectionTemplate.fillSlope,
    },
  };
}
function decimal(value: string, label: string): number {
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) ||
    !Number.isFinite(Number(value))
  )
    throw new RangeError(`${label}: supply a complete finite decimal.`);
  return Number(value);
}
const optional = (value: string, label: string) =>
  value.trim() ? decimal(value, label) : undefined;

/** Parse only complete input. Observation chainages/profiles are never relocated with the design. */
export function evaluateRoadWorkbenchDraft(
  base: RoadDesignData,
  draft: RoadWorkbenchDraft,
  reference: QuantityReference,
  selectedTerrain?: RoadTerrainIdentity,
) {
  try {
    if (draft.ips.length > 1000 || draft.vips.length > 1000)
      throw new RangeError(
        "Use at most 1,000 alignment/VIP points per work package.",
      );
    const ips: IntersectionPoint[] = draft.ips.map((p, i) => {
      if (!p.name.trim() || !p.id.trim())
        throw new RangeError(`PI ${i + 1}: supply a point name and ID.`);
      const radius = decimal(p.radius, `PI ${i + 1} Radius`);
      if (radius < 0)
        throw new RangeError(`PI ${i + 1}: radius must be non-negative.`);
      return {
        id: p.id,
        name: p.name,
        easting: decimal(p.easting, `PI ${i + 1} Easting`),
        northing: decimal(p.northing, `PI ${i + 1} Northing`),
        radius,
        hasTransition: p.hasTransition,
        transitionLengthIn: p.hasTransition
          ? decimal(p.transitionLengthIn, `PI ${i + 1} Entry spiral`)
          : optional(p.transitionLengthIn, `PI ${i + 1} Entry spiral`),
        transitionLengthOut: p.hasTransition
          ? decimal(p.transitionLengthOut, `PI ${i + 1} Exit spiral`)
          : optional(p.transitionLengthOut, `PI ${i + 1} Exit spiral`),
      };
    });
    const vips: VerticalIP[] = draft.vips.map((p, i) => ({
      id: p.id,
      chainage: decimal(p.chainage, `VIP ${i + 1} Chainage`),
      reducedLevel: decimal(
        p.reducedLevel,
        `VIP ${i + 1} Tangent intersection RL`,
      ),
      curveLength: optional(p.curveLength, `VIP ${i + 1} Curve length`),
      kValue: optional(p.kValue, `VIP ${i + 1} K`),
    }));
    const interval = optional(
      draft.verticalStationIntervalM,
      "Design profile interval",
    );
    validateVerticalDraft(vips, interval);
    if (vips.length) {
      const vertical = calculateRoadVertical(vips);
      if (!vertical.alignment) throw new RangeError(vertical.issues.join(" "));
    }
    const t = draft.template;
    const template: CrossSectionTemplate = {
      carriagewayWidth: decimal(t.carriagewayWidth, "Carriageway width"),
      shoulderWidth: decimal(t.shoulderWidth, "Shoulder width"),
      camber: decimal(t.camber, "Camber"),
      shoulderCrossfall: optional(t.shoulderCrossfall, "Shoulder crossfall"),
      subgradeDepth: decimal(t.subgradeDepth, "Subgrade depth"),
      cutSlope: t.cutSlope,
      fillSlope: t.fillSlope,
    };
    validateRoadTemplate(template);
    const road: RoadDesignData = {
      ...base,
      groundSectionAlignmentKey:
        base.groundSectionAlignmentKey ?? roadGroundAlignmentKey(base),
      startChainage: decimal(draft.startChainage, "Start chainage"),
      ips,
      vips,
      verticalStationIntervalM: interval,
      crossSectionTemplate: template,
      stations: base.stations.map((s) => {
        const station = { ...s };
        delete station.cutArea;
        delete station.fillArea;
        if (station.designLevelSource === "vertical-alignment")
          delete station.designLevel;
        return station;
      }),
    };
    const revision=draft.terrainRevisionId??base.retainedTerrain?.revisionId??'';
    if(revision){
      const identity=selectedTerrain??(base.retainedTerrain?.revisionId===revision?base.retainedTerrain:undefined);
      if(!identity||identity.revisionId!==revision)throw Error('Load the exact selected retained terrain revision before saving its binding.');
      if(identity.crs!==reference.code||identity.verticalDatum!==reference.verticalDatum)throw Error('The retained terrain uses a different coordinate or height reference.');
      road.retainedTerrain=roadTerrainBindingSchema.parse({...identity,intervalM:decimal(draft.terrainIntervalM??String(base.retainedTerrain?.intervalM??20),'Terrain section interval'),halfWidthM:decimal(draft.terrainHalfWidthM??String(base.retainedTerrain?.halfWidthM??20),'Terrain section half-width')});
    }else delete road.retainedTerrain;
    delete road.horizontalAlignment;
    delete road.verticalAlignment;
    delete road.earthworksTable;
    const model = buildRoadWorkbenchModel(road, reference);
    if (!model.horizontal) throw new RangeError(model.issues.join(" "));
    return { road, model, error: "" };
  } catch (cause) {
    return {
      road: null,
      model: null,
      error:
        cause instanceof Error
          ? cause.message
          : "Review the road inputs before continuing.",
    };
  }
}
