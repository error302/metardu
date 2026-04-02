import { detectFormat, getParser } from './registry';
import { applyBowditchAdjustment } from '@/math/traverse';
import { ParseResult, SupportedFormat, ParsedPoint } from '@/types/importer';

export { detectFormat, getParser } from './registry';

interface FieldbookEntry {
  station: string;
  bearing: number;
  distance: number;
  deltaE?: number;
  deltaN?: number;
}

export interface SmartImportResult {
  success: boolean;
  entries: FieldbookEntry[];
  errors: string[];
  warnings: string[];
  totalEntries: number;
  parserUsed?: string;
  processed?: boolean;
  adjustedLegs?: ReturnType<typeof applyBowditchAdjustment>['correctedLegs'];
  relativePrecision?: string;
  message?: string;
}

export const smartImport = async (file: File): Promise<SmartImportResult> => {
  const content = await file.text();
  const format = detectFormat(file.name, content);

  if (format === 'unknown') {
    return {
      success: false,
      entries: [],
      errors: ['Unknown file format'],
      warnings: [],
      totalEntries: 0,
      parserUsed: 'unknown'
    };
  }

  const parser = getParser(format);
  if (!parser) {
    return {
      success: false,
      entries: [],
      errors: [`No parser for format: ${format}`],
      warnings: [],
      totalEntries: 0,
      parserUsed: format
    };
  }

  const parseResult = parser.parse(content);
  const points = parseResult.points || [];

  if (points.length < 3) {
    return {
      success: false,
      entries: [],
      errors: [...(parseResult.errors || []), 'Insufficient data - need at least 3 stations'],
      warnings: parseResult.warnings,
      totalEntries: points.length,
      parserUsed: format
    };
  }

  const entries: FieldbookEntry[] = points.map((p: ParsedPoint) => ({
    station: p.point_no || 'UNKNOWN',
    bearing: p.bearing || 0,
    distance: p.distance || 0,
    deltaE: (p.raw_data as Record<string, number>)?.deltaE || 0,
    deltaN: (p.raw_data as Record<string, number>)?.deltaN || 0,
  }));

  const traverseRun = {
    legs: entries.map((e, i) => ({
      id: `leg-${i}`,
      from: e.station,
      to: entries[(i + 1) % entries.length]?.station || 'END',
      length: e.distance,
      bearing: e.bearing,
      latitude: e.deltaN || 0,
      departure: e.deltaE || 0,
    })),
    startE: 0,
    startN: 0,
  };

  const bowditchResult = applyBowditchAdjustment(traverseRun);

  return {
    success: true,
    entries,
    errors: parseResult.errors || [],
    warnings: parseResult.warnings,
    totalEntries: entries.length,
    parserUsed: format,
    processed: true,
    adjustedLegs: bowditchResult.correctedLegs,
    relativePrecision: bowditchResult.relativePrecision,
    message: `Imported ${entries.length} legs. Bowditch applied (${bowditchResult.relativePrecision})`
  };
};
