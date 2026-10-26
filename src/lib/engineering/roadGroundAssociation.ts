import { canonicalJSON } from "@/lib/audit/auditHash";
import type { RoadDesignData } from "@/types/engineering";

/** Exact geometry identity, not a cryptographic certification or field association assertion. */
export function roadGroundAlignmentKey(
  road: Pick<RoadDesignData, "coordinateSystem" | "startChainage" | "ips">,
): string {
  return canonicalJSON({
    version: 1,
    coordinateSystem: road.coordinateSystem,
    startChainage: road.startChainage,
    ips: road.ips.map((p) => ({
      easting: p.easting,
      northing: p.northing,
      radius: p.radius,
      transitionLengthIn: p.transitionLengthIn ?? 0,
      transitionLengthOut: p.transitionLengthOut ?? 0,
    })),
  });
}
export function roadGroundAssociationIssue(
  road: Pick<
    RoadDesignData,
    "coordinateSystem" | "startChainage" | "ips" | "groundSectionAlignmentKey"
  >,
): string | null {
  // Historical drafts have no declared association. This guard never upgrades that absence to field proof.
  if (road.groundSectionAlignmentKey === undefined) return null;
  if (
    !road.groundSectionAlignmentKey ||
    road.groundSectionAlignmentKey !== roadGroundAlignmentKey(road)
  )
    return "Retained ground sections belong to a different horizontal alignment. Re-survey or independently reassociate the original observations before using ground overlays, station targets or quantities.";
  return null;
}
