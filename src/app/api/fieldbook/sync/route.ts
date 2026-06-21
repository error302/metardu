import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { z } from 'zod'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

// ponytail: sync endpoint receives observations from the offline field book
// and stores them in the survey_points table. Each observation is idempotent
// (uses the client-generated UUID as the unique key).

const observationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  surveyType: z.string(),
  station: z.string(),
  backsight: z.string().optional(),
  foresight: z.string().optional(),
  bearingDeg: z.number().optional(),
  bearingMin: z.number().optional(),
  bearingSec: z.number().optional(),
  slopeDistance: z.number().optional(),
  horizontalDistance: z.number().optional(),
  verticalAngle: z.number().optional(),
  backsightReading: z.number().optional(),
  foresightReading: z.number().optional(),
  easting: z.number().optional(),
  northing: z.number().optional(),
  elevation: z.number().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
}).passthrough()

export const POST = apiHandler(
  { auth: true, rateLimit: { max: 120, windowMs: 60000 }, schema: observationSchema },
  async (req, ctx) => {
    const obs = ctx.body as z.infer<typeof observationSchema>

    // Upsert: if the observation ID already exists (re-sync), update it
    const result = await db.query(
      `INSERT INTO survey_points (
        id, project_id, station_name, backsight, foresight,
        bearing_deg, bearing_min, bearing_sec,
        slope_distance, horizontal_distance, vertical_angle,
        bs_reading, fs_reading,
        easting, northing, elevation,
        latitude, longitude, notes, created_at, user_id
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13,
        $14, $15, $16,
        $17, $18, $19, $20, $21
      )
      ON CONFLICT (id) DO UPDATE SET
        station_name = EXCLUDED.station_name,
        backsight = EXCLUDED.backsight,
        foresight = EXCLUDED.foresight,
        bearing_deg = EXCLUDED.bearing_deg,
        bearing_min = EXCLUDED.bearing_min,
        bearing_sec = EXCLUDED.bearing_sec,
        slope_distance = EXCLUDED.slope_distance,
        horizontal_distance = EXCLUDED.horizontal_distance,
        vertical_angle = EXCLUDED.vertical_angle,
        bs_reading = EXCLUDED.bs_reading,
        fs_reading = EXCLUDED.fs_reading,
        easting = EXCLUDED.easting,
        northing = EXCLUDED.northing,
        elevation = EXCLUDED.elevation,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        notes = EXCLUDED.notes
      RETURNING id`,
      [
        obs.id, obs.projectId, obs.station, obs.backsight ?? null, obs.foresight ?? null,
        obs.bearingDeg ?? null, obs.bearingMin ?? null, obs.bearingSec ?? null,
        obs.slopeDistance ?? null, obs.horizontalDistance ?? null, obs.verticalAngle ?? null,
        obs.backsightReading ?? null, obs.foresightReading ?? null,
        obs.easting ?? null, obs.northing ?? null, obs.elevation ?? null,
        obs.latitude ?? null, obs.longitude ?? null, obs.notes ?? null,
        obs.createdAt, ctx.userId,
      ],
    )

    return NextResponse.json({ ok: true, id: result.rows[0]?.id })
  },
)
