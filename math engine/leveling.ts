import { SurveyResult, ok, err } from "./types";

// ─── LEVELING ─────────────────────────────────────────────────────────────────

export type StationType = "BS" | "IS" | "FS" | "BSFS"; // BSFS = change point

export interface LevelingReading {
  station: string;
  staff: number;            // staff reading in metres
  type: StationType;
}

export interface LevelingRow {
  station: string;
  staff: number;
  type: StationType;
  rise: number | null;
  fall: number | null;
  reducedLevel: number;
  remarks?: string;
}

export interface LevelingResult {
  method: "rise_and_fall" | "height_of_collimation";
  rows: LevelingRow[];
  misclosure: number;       // metres — difference between computed and known closing RL
  adjustedRows: LevelingRow[];  // after distributing misclosure
  checks: {
    sumBS: number;
    sumFS: number;
    sumRise: number;
    sumFall: number;
    firstRL: number;
    lastRL: number;
    arithmeticCheckPassed: boolean;
    /**
     * Arithmetic check (Rise & Fall):
     *   Σ BS − Σ FS = Σ Rise − Σ Fall = Last RL − First RL
     */
  };
}

/**
 * Rise & Fall leveling reduction.
 *
 * Each RL = previous RL + rise (or − fall).
 * A rise occurs when current staff < previous staff.
 *
 * @param readings      Ordered staff readings from field book
 * @param openingRL     Known RL of the first station (benchmark)
 * @param closingRL     Known RL of the last station — if provided, misclosure
 *                      is computed and corrections distributed proportionally.
 */
export function riseAndFall(
  readings: LevelingReading[],
  openingRL: number,
  closingRL?: number
): SurveyResult<LevelingResult> {
  if (readings.length < 2) {
    return err("At least 2 readings are required.");
  }

  // ── Step 1: compute rise/fall and raw reduced levels ──────────────────────
  const rows: LevelingRow[] = [];
  let currentRL = openingRL;

  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    let rise: number | null = null;
    let fall: number | null = null;

    if (i > 0) {
      const prevStaff = readings[i - 1].staff;
      const diff = prevStaff - r.staff;  // positive diff = rise
      if (diff > 0) {
        rise = diff;
        currentRL += rise;
      } else if (diff < 0) {
        fall = -diff;
        currentRL -= fall;
      }
      // diff === 0: neither rise nor fall, RL unchanged
    }

    rows.push({
      station: r.station,
      staff: r.staff,
      type: r.type,
      rise,
      fall,
      reducedLevel: i === 0 ? openingRL : currentRL,
    });
  }

  // ── Step 2: arithmetic checks ─────────────────────────────────────────────
  const bsReadings = readings.filter(r => r.type === "BS" || r.type === "BSFS");
  const fsReadings = readings.filter(r => r.type === "FS" || r.type === "BSFS");
  const sumBS = bsReadings.reduce((s, r) => s + r.staff, 0);
  const sumFS = fsReadings.reduce((s, r) => s + r.staff, 0);
  const sumRise = rows.reduce((s, r) => s + (r.rise ?? 0), 0);
  const sumFall = rows.reduce((s, r) => s + (r.fall ?? 0), 0);
  const firstRL = rows[0].reducedLevel;
  const lastRL = rows[rows.length - 1].reducedLevel;

  // Check: Σ BS − Σ FS = Σ Rise − Σ Fall = Last RL − First RL
  const checkA = Math.abs((sumBS - sumFS) - (sumRise - sumFall)) < 0.0001;
  const checkB = Math.abs((sumRise - sumFall) - (lastRL - firstRL)) < 0.0001;

  // ── Step 3: misclosure and adjustment ─────────────────────────────────────
  let misclosure = 0;
  let adjustedRows = rows.map(r => ({ ...r }));

  if (closingRL !== undefined) {
    misclosure = lastRL - closingRL;

    // Distribute misclosure equally across all intermediate points
    // (simple proportional correction — one correction per instrument setup)
    const n = rows.length;
    for (let i = 1; i < n; i++) {
      const correction = -(i / (n - 1)) * misclosure;
      adjustedRows[i].reducedLevel = rows[i].reducedLevel + correction;
      adjustedRows[i].remarks = `corr ${correction >= 0 ? "+" : ""}${correction.toFixed(4)}`;
    }
  }

  return ok({
    method: "rise_and_fall",
    rows,
    misclosure,
    adjustedRows,
    checks: {
      sumBS,
      sumFS,
      sumRise,
      sumFall,
      firstRL,
      lastRL,
      arithmeticCheckPassed: checkA && checkB,
    },
  });
}

/**
 * Height of Collimation (HI) method.
 *
 * HI = RL of instrument station + BS staff reading
 * RL of any point = HI − staff reading at that point
 *
 * More efficient for many intermediate sights from one instrument setup.
 */
export function heightOfCollimation(
  readings: LevelingReading[],
  openingRL: number,
  closingRL?: number
): SurveyResult<LevelingResult> {
  if (readings.length < 2) {
    return err("At least 2 readings are required.");
  }
  if (readings[0].type !== "BS") {
    return err("First reading must be a Back Sight (BS).");
  }

  const rows: LevelingRow[] = [];
  let hi = openingRL + readings[0].staff;
  let currentRL = openingRL;

  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    let rl: number;

    if (r.type === "BS" || r.type === "BSFS") {
      // New instrument setup — current RL is from previous FS
      if (i > 0) {
        currentRL = hi - readings[i - 1].staff; // RL from the previous FS
        hi = currentRL + r.staff;               // new HI
      }
      rl = i === 0 ? openingRL : currentRL;
    } else {
      rl = hi - r.staff;
      currentRL = rl;
    }

    rows.push({
      station: r.station,
      staff: r.staff,
      type: r.type,
      rise: null,
      fall: null,
      reducedLevel: i === 0 ? openingRL : rl,
    });
  }

  const bsReadings = readings.filter(r => r.type === "BS" || r.type === "BSFS");
  const fsReadings = readings.filter(r => r.type === "FS" || r.type === "BSFS");
  const sumBS = bsReadings.reduce((s, r) => s + r.staff, 0);
  const sumFS = fsReadings.reduce((s, r) => s + r.staff, 0);
  const lastRL = rows[rows.length - 1].reducedLevel;
  const firstRL = rows[0].reducedLevel;

  let misclosure = 0;
  let adjustedRows = rows.map(r => ({ ...r }));
  if (closingRL !== undefined) {
    misclosure = lastRL - closingRL;
    const n = rows.length;
    for (let i = 1; i < n; i++) {
      const correction = -(i / (n - 1)) * misclosure;
      adjustedRows[i].reducedLevel += correction;
      adjustedRows[i].remarks = `corr ${correction >= 0 ? "+" : ""}${correction.toFixed(4)}`;
    }
  }

  return ok({
    method: "height_of_collimation",
    rows,
    misclosure,
    adjustedRows,
    checks: {
      sumBS,
      sumFS,
      sumRise: 0,
      sumFall: 0,
      firstRL,
      lastRL,
      arithmeticCheckPassed: Math.abs((sumBS - sumFS) - (lastRL - firstRL)) < 0.0001,
    },
  });
}
