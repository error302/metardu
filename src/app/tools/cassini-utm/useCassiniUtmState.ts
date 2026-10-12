'use client'

// State + handlers for the Cassini ↔ UTM converter tool.
//
// Extracted from src/app/tools/cassini-utm/page.tsx as a custom hook so
// the page component stays a thin orchestrator. All React state, refs and
// event handlers live here.

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  KENYA_TOPO_SHEETS,
} from '@/lib/geo/cassini/sheets'
import {
  cassiniFeetToUTM,
  utmToCassiniFeet,
  computeHelmert4Params,
} from '@/lib/geo/cassini/helmert'
import { verifyWithCommonPoints, projectedResultToWgs84, estimateSheetAccuracy } from '@/lib/geo/cassini/verify'
import type {
  CassiniFeetPoint,
  UTMPoint,
  ConversionResult,
  TopoSheetParams,
  VerificationResult,
  CommonPoint,
  SubSheetDef,
  TransformMethod,
} from '@/lib/geo/cassini/types'
import { CASSINI_BATCH_EXAMPLE, UTM_BATCH_EXAMPLE, r1, r3 } from './formatHelpers'

type SubSheetEngine = typeof import('@/lib/geo/cassini/subsheets')
let subSheetEnginePromise: Promise<SubSheetEngine> | null = null

function loadSubSheetEngine(): Promise<SubSheetEngine> {
  if (!subSheetEnginePromise) {
    subSheetEnginePromise = import('@/lib/geo/cassini/subsheets').catch((error) => {
      subSheetEnginePromise = null
      throw error
    })
  }
  return subSheetEnginePromise
}

function parseStrictNumber(value: string): number { return value.trim() ? Number(value) : NaN }

export function useCassiniUtmState() {
  // ── Direction ──
  const [direction, setDirection] = useState<'cassini-to-utm' | 'utm-to-cassini'>('cassini-to-utm')

  // ── Sheet Search ──
  const [sheetSearch, setSheetSearch] = useState('')

  // ── Topo Sheet Selection ──
  const [selectedSheetId, setSelectedSheetId] = useState<string>(KENYA_TOPO_SHEETS[0].id)
  const [useCustomParams, setUseCustomParams] = useState(false)
  const selectedSheetIdRef = useRef(selectedSheetId)
  selectedSheetIdRef.current = selectedSheetId

  // ── Filtered sheets list ──
  const filteredSheets = useMemo(() => {
    if (!sheetSearch.trim()) return KENYA_TOPO_SHEETS
    const q = sheetSearch.toLowerCase().trim()
    return KENYA_TOPO_SHEETS.filter(s =>
      s.id.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
    )
  }, [sheetSearch])

  // ── Sub-sheet Selection ──
  const [selectedSubSheetId, setSelectedSubSheetId] = useState<string>('__auto__')
  const [detectedSubSheet, setDetectedSubSheet] = useState<SubSheetDef | undefined>(undefined)
  const [loadedSubSheetRows, setLoadedSubSheetRows] = useState<SubSheetDef[]>([])
  const [subSheetDataLoadedFor, setSubSheetDataLoadedFor] = useState<string | null>(null)
  const [subSheetDataLoading, setSubSheetDataLoading] = useState(false)
  const [subSheetDataError, setSubSheetDataError] = useState<string | null>(null)
  const [geographicCrs, setGeographicCrs] = useState('')
  const [conversionPending, setConversionPending] = useState(false)
  const [conversionError, setConversionError] = useState<string | null>(null)

  // ── Transform Method ──
  const [transformMethod, setTransformMethod] = useState<TransformMethod | 'auto'>('auto')
  const [customP, setCustomP] = useState('0.3048')
  const [customQ, setCustomQ] = useState('0')
  const [customCx, setCustomCx] = useState('277474.6')
  const [customCy, setCustomCy] = useState('10000198.4')
  const [paramsOpen, setParamsOpen] = useState(false)

  // ── Input Mode ──
  const [inputMode, setInputMode] = useState<'single' | 'batch'>('single')

  // ── Single Point Inputs ──
  const [singleE, setSingleE] = useState('')
  const [singleN, setSingleN] = useState('')

  // ── Batch Input ──
  const [batchText, setBatchText] = useState('')

  // ── Results ──
  const [singleResult, setSingleResult] = useState<ConversionResult | null>(null)
  const [batchResults, setBatchResults] = useState<ConversionResult[]>([])
  const [batchErrors, setBatchErrors] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  // ── Verification ──
  const [showVerification, setShowVerification] = useState(false)

  // ── Calibration ──
  const [calibrationOpen, setCalibrationOpen] = useState(false)
  const [calibrationCsv, setCalibrationCsv] = useState('')
  const [calibrationResult, setCalibrationResult] = useState<TopoSheetParams | null>(null)
  const [calibrationErrors, setCalibrationErrors] = useState<string[]>([])
  const [calibrationResiduals, setCalibrationResiduals] = useState<VerificationResult[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Lazy sub-sheet data: the multi-megabyte corner dataset loads on demand ──
  const availableSubSheets = useMemo(() => {
    if (useCustomParams || subSheetDataLoadedFor !== selectedSheetId) return []
    return loadedSubSheetRows
  }, [useCustomParams, subSheetDataLoadedFor, selectedSheetId, loadedSubSheetRows])

  const loadCurrentSubSheetData = useCallback(async () => {
    const requestedSheetId = selectedSheetId
    setSubSheetDataLoading(true)
    setSubSheetDataError(null)
    try {
      const engine = await loadSubSheetEngine()
      const rows = engine.KENYA_SUB_SHEETS.filter(sheet => sheet.sheetId === requestedSheetId)
      if (selectedSheetIdRef.current === requestedSheetId) {
        setLoadedSubSheetRows(rows)
        setSubSheetDataLoadedFor(requestedSheetId)
      }
      return { engine, rows, requestedSheetId }
    } catch {
      if (selectedSheetIdRef.current === requestedSheetId) {
        setSubSheetDataError('Detailed sheet calibration data could not be loaded. No conversion was calculated.')
      }
      throw new Error('Detailed sheet calibration data could not be loaded.')
    } finally {
      if (selectedSheetIdRef.current === requestedSheetId) setSubSheetDataLoading(false)
    }
  }, [selectedSheetId])

  useEffect(() => {
    setSelectedSubSheetId('__auto__')
    setDetectedSubSheet(undefined)
    setLoadedSubSheetRows([])
    setSubSheetDataLoadedFor(null)
    setSubSheetDataError(null)
    setSubSheetDataLoading(false)
  }, [selectedSheetId])

  const handleLoadSubSheetData = useCallback(() => {
    void loadCurrentSubSheetData().catch(() => {})
  }, [loadCurrentSubSheetData])

  const hasSubSheets = availableSubSheets.length > 0

  // ── Derived: active sub-sheet ──
  const activeSubSheet = useMemo(() => {
    if (selectedSubSheetId === '__auto__') return detectedSubSheet
    return availableSubSheets.find(ss => ss.subId === selectedSubSheetId)
  }, [selectedSubSheetId, detectedSubSheet, availableSubSheets])

  // Invalidate results when their inputs change, including edits during a lazy load.
  const singleInputKey = JSON.stringify([direction, singleE, singleN, selectedSheetId, selectedSubSheetId, useCustomParams, customP, customQ, customCx, customCy, transformMethod, geographicCrs])
  const batchInputKey = JSON.stringify([direction, batchText, selectedSheetId, selectedSubSheetId, useCustomParams, customP, customQ, customCx, customCy, transformMethod, geographicCrs])
  const currentSingleKey = useRef(singleInputKey), currentBatchKey = useRef(batchInputKey)
  currentSingleKey.current = singleInputKey
  currentBatchKey.current = batchInputKey
  useEffect(() => { setSingleResult(null); setConversionError(null) }, [singleInputKey])
  useEffect(() => { setBatchResults([]); setBatchErrors([]) }, [batchInputKey])

  // ── Derived Sheet Params (resolves to actual params used for conversion) ──
  const activeSheet: TopoSheetParams = useMemo(() => {
    if (useCustomParams) {
      return {
        id: 'custom',
        name: 'Custom Parameters',
        description: 'User-defined Helmert transformation parameters.',
        P: parseStrictNumber(customP),
        Q: parseStrictNumber(customQ),
        Cx: parseStrictNumber(customCx),
        Cy: parseStrictNumber(customCy),
        commonPoints: [],
      }
    }
    // If sub-sheet is active, use its Helmert params
    if (activeSubSheet) return activeSubSheet.helmertParams
    return KENYA_TOPO_SHEETS.find(s => s.id === selectedSheetId) ?? KENYA_TOPO_SHEETS[0]
  }, [useCustomParams, selectedSheetId, customP, customQ, customCx, customCy, activeSubSheet])

  // ── Accuracy Grade (enhanced for sub-sheets) ──
  const accuracyInfo = useMemo(() => {
    if (activeSubSheet) {
      return estimateSheetAccuracy(activeSubSheet.helmertParams)
    }
    return estimateSheetAccuracy(activeSheet)
  }, [activeSheet, activeSubSheet])

  const accuracyColorClass = useMemo(() => {
    switch (accuracyInfo.grade) {
      case 'EXCELLENT': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
      case 'GOOD': return 'bg-green-500/10 border-green-500/20 text-green-400'
      case 'MODERATE': return 'bg-amber-500/10 border-amber-500/20 text-amber-400'
      case 'LOW': return 'bg-red-500/10 border-red-500/20 text-red-400'
      default: return 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400'
    }
  }, [accuracyInfo.grade])

  const accuracyBadgeClass = useMemo(() => {
    switch (accuracyInfo.grade) {
      case 'EXCELLENT': return 'bg-emerald-500/20 text-emerald-300'
      case 'GOOD': return 'bg-green-500/20 text-green-300'
      case 'MODERATE': return 'bg-amber-500/20 text-amber-300'
      case 'LOW': return 'bg-red-500/20 text-red-300'
      default: return 'bg-zinc-500/20 text-zinc-300'
    }
  }, [accuracyInfo.grade])

  // ── WGS84 from single result (zone-aware) ──
  const geography = useMemo(() => {
    if (!singleResult) return { result: null, error: null }
    if (!geographicCrs.trim()) return { result: null, error: 'Declare the projected result grid before calculating geographic coordinates.' }
    try { return { result: projectedResultToWgs84(singleResult.utmE, singleResult.utmN, geographicCrs.trim()), error: null } }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : 'Geographic conversion could not be calculated.' } }
  }, [singleResult, geographicCrs])
  const singleWGS84 = geography.result
  const geographicError = geography.error

  // ── Calibration Handler ──
  const handleCalibrate = useCallback(() => {
    const lines = calibrationCsv.trim().split('\n').filter(l => l.trim())
    const points: CommonPoint[] = []
    const errors: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const parts = line.split(',').map(s => s.trim())
      if (parts.length < 5) {
        errors.push(`Line ${i + 1}: Expected "station,cassN_ft,cassE_ft,utmN_m,utmE_m" — skipped`)
        continue
      }
      const station = parts[0]
      const cassN = parseFloat(parts[1])
      const cassE = parseFloat(parts[2])
      const utmN = parseFloat(parts[3])
      const utmE = parseFloat(parts[4])
      if ([cassN, cassE, utmN, utmE].some(isNaN)) {
        errors.push(`Line ${i + 1} (${station}): Invalid coordinates — skipped`)
        continue
      }
      points.push({ station, cassN, cassE, utmN, utmE })
    }

    setCalibrationErrors(errors)
    if (points.length < 2) {
      setCalibrationResult(null)
      setCalibrationResiduals([])
      if (errors.length === 0) {
        errors.push('Need at least 2 common points to compute parameters')
      }
      setCalibrationErrors(errors)
      return
    }

    try {
      const params = computeHelmert4Params(points)
      setCalibrationResult(params as TopoSheetParams)
      setCalibrationResiduals(verifyWithCommonPoints(params as TopoSheetParams))
    } catch (err) {
      setCalibrationResult(null)
      setCalibrationResiduals([])
      errors.push(`Computation error: ${err instanceof Error ? err.message : String(err)}`)
      setCalibrationErrors(errors)
    }
  }, [calibrationCsv])

  const handleUseCalibrationParams = useCallback(() => {
    if (!calibrationResult) return
    setCustomP(String(calibrationResult.P))
    setCustomQ(String(calibrationResult.Q))
    setCustomCx(String(calibrationResult.Cx))
    setCustomCy(String(calibrationResult.Cy))
    setUseCustomParams(true)
    setCalibrationOpen(false)
  }, [calibrationResult])

  // ── Verification Results ──
  const verificationResults = useMemo(() => {
    if (!showVerification || activeSheet.commonPoints.length === 0) return []
    return verifyWithCommonPoints(activeSheet)
  }, [showVerification, activeSheet])

  // ── Reset results on direction change ──
  const handleDirectionChange = useCallback((dir: 'cassini-to-utm' | 'utm-to-cassini') => {
    setDirection(dir)
    setSingleResult(null)
    setBatchResults([])
    setBatchErrors([])
    setBatchText('')
    setDetectedSubSheet(undefined)
  }, [])

  // ── Single Convert ──
  const handleSingleConvert = useCallback(async () => {
    const e = Number(singleE), n = Number(singleN)
    if (!singleE.trim() || !singleN.trim() || !Number.isFinite(e) || !Number.isFinite(n)) {
      setSingleResult(null); setConversionError('Enter finite easting and northing values.'); return
    }
    setConversionPending(true)
    setConversionError(null)
    try {
      const loaded = useCustomParams ? null : await loadCurrentSubSheetData()
      if (selectedSheetIdRef.current !== selectedSheetId || currentSingleKey.current !== singleInputKey) return
      const selectedRows = loaded?.rows ?? []
      const detected = loaded?.engine.SHEETS_WITH_SUBSHEETS.has(selectedSheetId)
        ? loaded.engine.findSubSheet(selectedSheetId, e, n)
        : undefined
      if (detected) setDetectedSubSheet(detected)
      const sub = useCustomParams
        ? undefined
        : selectedSubSheetId === '__auto__'
          ? detected
          : selectedRows.find(sheet => sheet.subId === selectedSubSheetId)

      if (!useCustomParams && selectedSubSheetId !== '__auto__' && !sub) {
        setConversionError('The selected sub-sheet is not available for this map sheet. Choose Auto-detect or reload the detailed sheet data.')
        return
      }

      if (direction === 'cassini-to-utm') {
        const pts: CassiniFeetPoint[] = [{ easting: e, northing: n }]
        if (sub && transformMethod !== 'helmert4' && loaded) {
          setSingleResult(loaded.engine.convertCassiniToUTM(pts, sub)[0])
        } else {
          setSingleResult(cassiniFeetToUTM(pts, sub ? sub.helmertParams : activeSheet)[0])
        }
      } else {
        const pts: UTMPoint[] = [{ easting: e, northing: n }]
        if (sub && transformMethod !== 'helmert4' && loaded) {
          setSingleResult(loaded.engine.convertUTMToCassini(pts, sub)[0])
        } else {
          setSingleResult(utmToCassiniFeet(pts, sub ? sub.helmertParams : activeSheet)[0])
        }
      }
    } catch (error) {
      if (currentSingleKey.current !== singleInputKey) return
      setSingleResult(null)
      setConversionError(error instanceof RangeError ? error.message : 'Detailed sheet calibration data could not be loaded. No conversion was calculated; retry when online.')
    } finally {
      setConversionPending(false)
    }
  }, [singleE, singleN, useCustomParams, loadCurrentSubSheetData, selectedSheetId, selectedSubSheetId, direction, activeSheet, transformMethod, singleInputKey])

  // ── Batch Convert ──
  const handleBatchConvert = useCallback(async () => {
    const lines = batchText.trim().split('\n').filter(l => l.trim())
    const errors: string[] = []
    const points: { id: string; e: number; n: number }[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const parts = line.split(',').map(s => s.trim())

      if (parts.length < 3) {
        errors.push(`Line ${i + 1}: Expected "id,easting,northing" — skipped`)
        continue
      }
      const id = parts[0]
      const e = parseStrictNumber(parts[1])
      const n = parseStrictNumber(parts[2])
      if (!Number.isFinite(e) || !Number.isFinite(n)) {
        errors.push(`Line ${i + 1} (${id}): Invalid coordinates — skipped`)
        continue
      }

      points.push({ id, e, n })
    }

    setConversionPending(true)
    setConversionError(null)
    try {
      const loaded = !useCustomParams && points.length > 0 ? await loadCurrentSubSheetData() : null
      if (selectedSheetIdRef.current !== selectedSheetId || currentBatchKey.current !== batchInputKey) return
      const validResults: ConversionResult[] = []
      const selectedRows = loaded?.rows ?? []

      for (const point of points) {
        const detected = loaded?.engine.SHEETS_WITH_SUBSHEETS.has(selectedSheetId)
          ? loaded.engine.findSubSheet(selectedSheetId, point.e, point.n)
          : undefined
        const sub = useCustomParams
          ? undefined
          : selectedSubSheetId === '__auto__'
            ? detected
            : selectedRows.find(sheet => sheet.subId === selectedSubSheetId)
        if (!useCustomParams && selectedSubSheetId !== '__auto__' && !sub) throw new RangeError('The selected sub-sheet is unavailable for this map sheet; choose Auto-detect or reload its data.')
        const params = sub ? sub.helmertParams : activeSheet
        const input = [{ id: point.id, easting: point.e, northing: point.n }]
        const results = sub && transformMethod !== 'helmert4' && loaded
          ? direction === 'cassini-to-utm'
            ? loaded.engine.convertCassiniToUTM(input, sub)
            : loaded.engine.convertUTMToCassini(input, sub)
          : direction === 'cassini-to-utm' ? cassiniFeetToUTM(input, params) : utmToCassiniFeet(input, params)
        validResults.push(results[0])
      }

      setBatchResults(validResults)
      setBatchErrors(errors)
    } catch (error) {
      if (currentBatchKey.current !== batchInputKey) return
      setBatchResults([])
      setBatchErrors([...errors, error instanceof RangeError ? error.message : 'Detailed sheet calibration data could not be loaded. No batch conversions were calculated; retry when online.'])
    } finally {
      setConversionPending(false)
    }
  }, [batchText, useCustomParams, loadCurrentSubSheetData, selectedSheetId, selectedSubSheetId, direction, activeSheet, batchInputKey, transformMethod])

  // ── Load Example ──
  const handleLoadExample = useCallback(() => {
    const example = direction === 'cassini-to-utm' ? CASSINI_BATCH_EXAMPLE : UTM_BATCH_EXAMPLE
    setBatchText(example)
    setBatchResults([])
    setBatchErrors([])
  }, [direction])

  // ── Copy helpers ──
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [])

  const handleCopySingle = useCallback(() => {
    if (!singleResult) return
        const lines = [
      `Cassini-Soldner ↔ UTM Conversion (Helmert 4-Parameter)`,
      `Topo Sheet: ${activeSheet.name}`,
      `Datum: Arc 1960 / UTM Zone 37S`,
      ``,
      direction === 'cassini-to-utm'
        ? `Source Cassini: E = ${r1(singleResult.cassiniE)} ft, N = ${r1(singleResult.cassiniN)} ft`
        : `Source UTM: E = ${r3(singleResult.utmE)} m, N = ${r3(singleResult.utmN)} m`,
      direction === 'cassini-to-utm'
        ? `Result UTM: E = ${r3(singleResult.utmE)} m, N = ${r3(singleResult.utmN)} m`
        : `Result Cassini: E = ${r1(singleResult.cassiniE)} ft, N = ${r1(singleResult.cassiniN)} ft`,
      `Conformal E: ${r1(singleResult.conformalE)} ft`,
    ]
    if (singleResult.warning) {
      lines.push(`Warning: ${singleResult.warning}`)
    }
    copyToClipboard(lines.join('\n'))
  }, [singleResult, activeSheet, direction, copyToClipboard])

  const handleCopyBatchCsv = useCallback(() => {
    if (batchResults.length === 0) return
    const srcUnit = direction === 'cassini-to-utm' ? 'ft' : 'm'
    const tgtUnit = direction === 'cassini-to-utm' ? 'm' : 'ft'
    const header = `ID,Src_E(${srcUnit}),Src_N(${srcUnit}),Tgt_E(${tgtUnit}),Tgt_N(${tgtUnit}),Conformal_E(ft)`
    const rows = batchResults.map(r =>
      [
        r.id ?? '',
        direction === 'cassini-to-utm' ? r1(r.cassiniE) : r3(r.utmE),
        direction === 'cassini-to-utm' ? r1(r.cassiniN) : r3(r.utmN),
        direction === 'cassini-to-utm' ? r3(r.utmE) : r1(r.cassiniE),
        direction === 'cassini-to-utm' ? r3(r.utmN) : r1(r.cassiniN),
        r1(r.conformalE),
      ].join(',')
    )
    copyToClipboard([header, ...rows].join('\n'))
  }, [batchResults, direction, copyToClipboard])

  const handleDownloadCsv = useCallback(() => {
    if (batchResults.length === 0) return
    const srcUnit = direction === 'cassini-to-utm' ? 'ft' : 'm'
    const tgtUnit = direction === 'cassini-to-utm' ? 'm' : 'ft'
    const header = `ID,Src_E(${srcUnit}),Src_N(${srcUnit}),Tgt_E(${tgtUnit}),Tgt_N(${tgtUnit}),Conformal_E(ft)`
    const rows = batchResults.map(r =>
      [
        r.id ?? '',
        direction === 'cassini-to-utm' ? r1(r.cassiniE) : r3(r.utmE),
        direction === 'cassini-to-utm' ? r1(r.cassiniN) : r3(r.utmN),
        direction === 'cassini-to-utm' ? r3(r.utmE) : r1(r.cassiniE),
        direction === 'cassini-to-utm' ? r3(r.utmN) : r1(r.cassiniN),
        r1(r.conformalE),
      ].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cassini-utm-${direction}-${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [batchResults, direction])

  return {
    // direction
    direction,
    handleDirectionChange,
    // sheet search
    sheetSearch,
    setSheetSearch,
    filteredSheets,
    // sheet selection
    selectedSheetId,
    setSelectedSheetId,
    useCustomParams,
    setUseCustomParams,
    // sub-sheet
    selectedSubSheetId,
    setSelectedSubSheetId,
    detectedSubSheet,
    setDetectedSubSheet,
    availableSubSheets,
    hasSubSheets,
    activeSubSheet,
    subSheetDataLoadedFor,
    subSheetDataLoading,
    subSheetDataError,
    handleLoadSubSheetData,
    // transform method
    transformMethod,
    setTransformMethod,
    // custom params
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
    // input mode
    inputMode,
    setInputMode,
    // single point
    singleE,
    setSingleE,
    singleN,
    setSingleN,
    singleResult,
    setSingleResult,
    singleWGS84,
    geographicCrs, setGeographicCrs, geographicError,
    // batch
    batchText,
    setBatchText,
    batchResults,
    setBatchResults,
    batchErrors,
    setBatchErrors,
    handleBatchConvert,
    handleLoadExample,
    handleCopyBatchCsv,
    handleDownloadCsv,
    // copy state
    copied,
    handleCopySingle,
    // verification
    showVerification,
    setShowVerification,
    verificationResults,
    // calibration
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
    // active sheet + accuracy
    activeSheet,
    accuracyInfo,
    accuracyColorClass,
    accuracyBadgeClass,
    // conversion
    handleSingleConvert,
    conversionPending,
    conversionError,
  }
}

export type UseCassiniUtmStateReturn = ReturnType<typeof useCassiniUtmState>
