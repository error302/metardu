'use client';

import { Info, Shield, MapPin, Ruler, BookOpen } from 'lucide-react';

/**
 * Trust Signals Component
 * Displays computation standards, coordinate system, and compliance information
 * that surveyors need when submitting documents to government.
 * Source: Kenya Survey Act Cap 299 — surveyors must know software compliance
 */
export function TrustSignals({
  compact = false,
  coordinateSystem = 'Arc 1960 / UTM Zone 37S',
  srid = 'EPSG:21037',
}: {
  compact?: boolean;
  coordinateSystem?: string;
  srid?: string;
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {srid}
        </span>
        <span className="flex items-center gap-1">
          <BookOpen className="h-3 w-3" />
          RDM 1.1
        </span>
        <span className="flex items-center gap-1">
          <Shield className="h-3 w-3" />
          Survey Regs 1994
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
        <Shield className="h-4 w-4 text-[var(--accent)]" />
        Compliance &amp; Standards
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
        <div className="flex items-center gap-2">
          <MapPin className="h-3 w-3 shrink-0" />
          <span><strong>Coordinate System:</strong> {coordinateSystem}</span>
        </div>
        <div className="flex items-center gap-2">
          <Ruler className="h-3 w-3 shrink-0" />
          <span><strong>SRID:</strong> {srid}</span>
        </div>
        <div className="flex items-center gap-2">
          <BookOpen className="h-3 w-3 shrink-0" />
          <span><strong>Computation Standard:</strong> RDM 1.1 Kenya 2025</span>
        </div>
        <div className="flex items-center gap-2">
          <Info className="h-3 w-3 shrink-0" />
          <span><strong>Regulatory Framework:</strong> Survey Regulations 1994, Cap 299</span>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="h-3 w-3 shrink-0" />
          <span><strong>Adjustment Methods:</strong> Bowditch (Compass) / Transit Rule per Ghilani &amp; Wolf</span>
        </div>
        <div className="flex items-center gap-2">
          <Ruler className="h-3 w-3 shrink-0" />
          <span><strong>Minimum Precision:</strong> 1:5000 cadastral (Kenya)</span>
        </div>
      </div>
    </div>
  );
}
