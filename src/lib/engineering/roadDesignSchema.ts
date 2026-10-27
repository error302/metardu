import { z } from 'zod'
import type { RoadDesignData } from '@/types/engineering'
import {roadTerrainBindingSchema} from './roadTerrain'

const finite = z.number().finite()
// Validate complete source shapes before using JSONB as the quantity authority.
// Passthrough retains original fields; only the shared engine chooses consumed inputs.
export const roadDesignDataSchema: z.ZodType<RoadDesignData> = z
  .object({
    roadName: z.string(),
    retainedTerrain:roadTerrainBindingSchema.optional(),
    startChainage: finite,
    datum: z.string(),
    coordinateSystem: z.string(),
    designSpeed: finite,
    roadClass: z.enum([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
      'J',
      'K',
      'L',
      'M',
      'N',
      'P',
    ]),
    ips: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().min(1),
            easting: finite,
            northing: finite,
            radius: finite,
            hasTransition: z.boolean().optional(),
            transitionLengthIn: finite.optional(),
            transitionLengthOut: finite.optional(),
          })
          .passthrough(),
      )
      .max(1000),
    vips: z
      .array(
        z
          .object({
            id: z.string().min(1),
            chainage: finite,
            reducedLevel: finite,
            kValue: finite.optional(),
            curveLength: finite.optional(),
            gradientIn: finite.optional(),
            gradientOut: finite.optional(),
          })
          .passthrough(),
      )
      .max(1000),
    verticalStationIntervalM: finite.optional(),
    groundSectionAlignmentKey: z.string().optional(),
    crossSectionTemplate: z
      .object({
        carriagewayWidth: finite,
        shoulderWidth: finite,
        camber: finite,
        subgradeDepth: finite,
        cutSlope: z.string(),
        fillSlope: z.string(),
        shoulderCrossfall: finite.optional(),
      })
      .passthrough(),
    stations: z
      .array(
        z
          .object({
            chainage: finite,
            groundLevel: finite,
            designLevel: finite.optional(),
            designLevelSource: z
              .enum(['manual', 'vertical-alignment'])
              .optional(),
            groundProfile: z
              .array(z.object({ offset: finite, level: finite }).passthrough())
              .max(250000)
              .optional(),
          })
          .passthrough(),
      )
      .max(5000),
  })
  .passthrough()
