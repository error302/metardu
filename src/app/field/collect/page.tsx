'use client';

/**
 * /field/collect — Field Data Collector
 *
 * The purpose-built field data collection experience.
 * Replaces the old GPS-only beacon capture with a full-featured collector
 * that supports both total stations and GNSS rovers.
 *
 * Features:
 *   - Instrument connection (Bluetooth/Serial/Web)
 *   - Station setup (IH, TH, backsight, atmospheric)
 *   - One-tap measurement capture
 *   - Live QC (tolerance checking per RDM 1.1)
 *   - Stakeout mode
 *   - Offline-first (IndexedDB + auto-sync)
 */

import { useState } from 'react'
import { FieldDataCollector } from '@/components/field/FieldDataCollector'
import { ProjectPicker } from '@/components/field/ProjectPicker'

export default function FieldCollectPage() {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [surveyType, setSurveyType] = useState<'cadastral' | 'engineering' | 'topographic' | 'control'>('cadastral')

  if (!projectId) {
    return (
      <ProjectPicker
        onPick={(id, type) => {
          setProjectId(id)
          if (type && ['cadastral', 'engineering', 'topographic', 'control'].includes(type)) {
            setSurveyType(type as 'cadastral' | 'engineering' | 'topographic' | 'control')
          }
        }}
        title="Field Data Collector"
        subtitle="Select a project to begin collecting measurements"
      />
    )
  }

  return <FieldDataCollector projectId={projectId} surveyType={surveyType} />
}
