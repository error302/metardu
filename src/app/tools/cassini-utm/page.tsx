'use client'

import { PageHeader } from '@/components/shared/PageHeader'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { AlertTriangle, Activity } from 'lucide-react'

import { useCassiniUtmState } from './useCassiniUtmState'
import { SubSheetCornerBanner } from './SubSheetInspector'
import { InputForm } from './InputForm'
import { ResultPanel } from './ResultPanel'

/* ═══════════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════════════════ */

export default function CassiniUTMPage() {
  const s = useCassiniUtmState()
  const {
    direction,
    handleDirectionChange,
    sheetSearch,
    setSheetSearch,
    filteredSheets,
    selectedSheetId,
    setSelectedSheetId,
    useCustomParams,
    setUseCustomParams,
    selectedSubSheetId,
    setSelectedSubSheetId,
    detectedSubSheet,
    setDetectedSubSheet,
    availableSubSheets,
    hasSubSheets,
    activeSubSheet,
    transformMethod,
    setTransformMethod,
    customP,
    setCustomP,
    customQ,
    setCustomQ,
    customCx,
    setCustomCx,
    customCy,
    setCustomCy,
    paramsOpen,
    setParamsOpen,
    activeSheet,
    accuracyInfo,
    accuracyColorClass,
    accuracyBadgeClass,
    showVerification,
    setShowVerification,
    verificationResults,
    calibrationOpen,
    setCalibrationOpen,
    calibrationCsv,
    setCalibrationCsv,
    calibrationResult,
    calibrationErrors,
    calibrationResiduals,
    handleCalibrate,
    handleUseCalibrationParams,
    fileInputRef,
    inputMode,
    setInputMode,
    setBatchResults,
    setBatchErrors,
    setSingleResult,
    singleE,
    setSingleE,
    singleN,
    setSingleN,
    handleSingleConvert,
    batchText,
    setBatchText,
    handleBatchConvert,
    handleLoadExample,
    singleResult,
    singleWGS84,
    copied,
    handleCopySingle,
    batchResults,
    batchErrors,
    handleCopyBatchCsv,
    handleDownloadCsv,
  } = s

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:py-16">
      {/* ── Breadcrumb ── */}
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/tools">Quick Tools</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Cassini ↔ UTM</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* ── Page Header ── */}
      <PageHeader
        title="Cassini-Soldner ↔ UTM Converter"
        subtitle="Kenya Survey Department 4-parameter Helmert transformation — Cassini (FEET, Clarke 1858) ↔ UTM (METRES, Clarke 1880 / Arc 1960)"
        reference="Gacoki (FIG 2018) | Arc 1960 datum | UTM Zone 37S | Cassini meridian 37°E"
      />

      {/* ── Units Banner ── */}
      <div className="mb-6 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong>Units:</strong> Cassini inputs are in <strong>International Feet</strong> (Clarke 1858).
          UTM outputs are in <strong>Metres</strong> (Clarke 1880 / Arc 1960, UTM Zone 37S).
          The P parameter (~0.3048) handles the feet→metres conversion.
        </div>
      </div>

      {/* ── Accuracy Grade Banner ── */}
      <div className={`mb-6 p-3 rounded-lg border flex items-start gap-2 text-xs ${accuracyColorClass}`}>
        <Activity className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="flex items-center gap-3 flex-wrap">
          <span>
            <strong>Sheet Accuracy:</strong>{' '}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${accuracyBadgeClass}`}>
              {accuracyInfo.grade}
            </span>
          </span>
          {!isNaN(accuracyInfo.rmseMM) && (
            <span className="font-mono">RMSE: {accuracyInfo.rmseMM.toFixed(1)} mm ({accuracyInfo.rmseM.toFixed(4)} m)</span>
          )}
          {activeSheet.commonPoints.length === 0 && (
            <span className="text-[var(--text-muted)]">No common points available for accuracy estimation</span>
          )}
          <span className="text-[var(--text-muted)]">({activeSheet.commonPoints.length} control points)</span>
          {activeSubSheet && (
            <span className="text-emerald-400">· Sub-sheet {activeSubSheet.fullId} (per-corner fit)</span>
          )}
        </div>
      </div>

      {/* ── Sub-sheet Corner Details (when active) ── */}
      {activeSubSheet && (
        <SubSheetCornerBanner activeSubSheet={activeSubSheet} />
      )}

      {/* ═══════════════════════════════════════════════════════════════════
       *  TWO-PANEL GRID
       * ═════════════════════════════════════════════════════════════════ */}
      <div className="grid md:grid-cols-2 gap-8">
        {/* LEFT PANEL — INPUTS */}
        <InputForm
          direction={direction}
          handleDirectionChange={handleDirectionChange}
          sheetSearch={sheetSearch}
          setSheetSearch={setSheetSearch}
          filteredSheets={filteredSheets}
          selectedSheetId={selectedSheetId}
          setSelectedSheetId={setSelectedSheetId}
          useCustomParams={useCustomParams}
          setUseCustomParams={setUseCustomParams}
          selectedSubSheetId={selectedSubSheetId}
          setSelectedSubSheetId={setSelectedSubSheetId}
          setDetectedSubSheet={setDetectedSubSheet}
          detectedSubSheet={detectedSubSheet}
          activeSubSheet={activeSubSheet}
          availableSubSheets={availableSubSheets}
          hasSubSheets={hasSubSheets}
          transformMethod={transformMethod}
          setTransformMethod={setTransformMethod}
          customP={customP}
          setCustomP={setCustomP}
          customQ={customQ}
          setCustomQ={setCustomQ}
          customCx={customCx}
          setCustomCx={setCustomCx}
          customCy={customCy}
          setCustomCy={setCustomCy}
          paramsOpen={paramsOpen}
          setParamsOpen={setParamsOpen}
          activeSheet={activeSheet}
          showVerification={showVerification}
          setShowVerification={setShowVerification}
          verificationResults={verificationResults}
          calibrationOpen={calibrationOpen}
          setCalibrationOpen={setCalibrationOpen}
          calibrationCsv={calibrationCsv}
          setCalibrationCsv={setCalibrationCsv}
          calibrationResult={calibrationResult}
          calibrationErrors={calibrationErrors}
          calibrationResiduals={calibrationResiduals}
          handleCalibrate={handleCalibrate}
          handleUseCalibrationParams={handleUseCalibrationParams}
          fileInputRef={fileInputRef}
          inputMode={inputMode}
          setInputMode={setInputMode}
          setBatchResults={setBatchResults}
          setBatchErrors={setBatchErrors}
          setSingleResult={setSingleResult}
          singleE={singleE}
          setSingleE={setSingleE}
          singleN={singleN}
          setSingleN={setSingleN}
          handleSingleConvert={handleSingleConvert}
          batchText={batchText}
          setBatchText={setBatchText}
          handleBatchConvert={handleBatchConvert}
          handleLoadExample={handleLoadExample}
        />

        {/* RIGHT PANEL — RESULTS */}
        <ResultPanel
          inputMode={inputMode}
          direction={direction}
          singleResult={singleResult}
          singleWGS84={singleWGS84}
          activeSheet={activeSheet}
          copied={copied}
          handleCopySingle={handleCopySingle}
          batchResults={batchResults}
          batchErrors={batchErrors}
          handleCopyBatchCsv={handleCopyBatchCsv}
          handleDownloadCsv={handleDownloadCsv}
        />
      </div>
    </div>
  )
}
