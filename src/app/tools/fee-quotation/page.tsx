'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import {
  Calculator,
  FileText,
  Download,
  Copy,
  Check,
  Building,
  ShieldCheck,
  Clock,
  Printer,
  Info,
} from 'lucide-react'
import {
  computeSurveyFee,
  FeeQuoteInput,
  SurveyCategory,
  CurrencyCode,
} from '@/lib/business/surveyFeeCalculator'

const CATEGORIES: Array<{
  id: SurveyCategory
  name: string
  law: string
  desc: string
}> = [
  {
    id: 'cadastral_subdivision',
    name: 'Cadastral Subdivision',
    law: 'Survey Act Cap 299 § 22',
    desc: 'Partition of titled land into resultant freehold or leasehold parcels',
  },
  {
    id: 'boundary_reestablishment',
    name: 'Boundary Re-establishment',
    law: 'Survey Act Cap 299 § 18',
    desc: 'Beacon recovery, dispute resolution, and boundary monument replacement',
  },
  {
    id: 'topographic_survey',
    name: 'Topographic & DEM',
    law: 'Survey Regulations Reg 45',
    desc: 'Ground elevation modeling, contour generation, and feature mapping',
  },
  {
    id: 'engineering_road',
    name: 'Engineering & Alignment',
    law: 'RDM / KeNHA Standard',
    desc: 'Centerline staking, cross-section leveling, and road corridor profiling',
  },
  {
    id: 'title_survey',
    name: 'Title & Deed Plan Survey',
    law: 'Land Registration Act 2012',
    desc: 'Statutory boundary survey, Deed Plan authentication, and RIM update',
  },
]

const CURRENCIES: Array<{ code: CurrencyCode; label: string; symbol: string }> = [
  { code: 'KES', label: 'Kenyan Shilling (KES)', symbol: 'KSh' },
  { code: 'USD', label: 'US Dollar (USD)', symbol: '$' },
  { code: 'EUR', label: 'Euro (EUR)', symbol: '€' },
  { code: 'GBP', label: 'British Pound (GBP)', symbol: '£' },
  { code: 'TZS', label: 'Tanzanian Shilling (TZS)', symbol: 'TSh' },
  { code: 'UGX', label: 'Ugandan Shilling (UGX)', symbol: 'USh' },
]

export default function FeeQuotationPage() {
  const { data: session } = useSession()

  // Form State
  const [category, setCategory] = useState<SurveyCategory>('cadastral_subdivision')
  const [areaValue, setAreaValue] = useState<number>(2.5)
  const [areaUnit, setAreaUnit] = useState<'ha' | 'acres'>('ha')
  const [resultantPlots, setResultantPlots] = useState<number>(4)
  const [beaconsToSet, setBeaconsToSet] = useState<number>(6)
  const [distanceKm, setDistanceKm] = useState<number>(35)
  const [currency, setCurrency] = useState<CurrencyCode>('KES')
  const [includeVat, setIncludeVat] = useState<boolean>(true)
  const [customMarkupPercent, setCustomMarkupPercent] = useState<number>(0)

  // Client & Firm Details
  const [clientName, setClientName] = useState<string>('')
  const [projectName, setProjectName] = useState<string>('')
  const [lrNumber, setLrNumber] = useState<string>('')
  const [surveyorName, setSurveyorName] = useState<string>('')
  const [firmName, setFirmName] = useState<string>('')
  const [iskNumber, setIskNumber] = useState<string>('')

  // UI state
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [copiedSummary, setCopiedSummary] = useState(false)
  const [activeTab, setActiveTab] = useState<'quote' | 'milestones'>('quote')

  // Prefill surveyor info if session exists
  useEffect(() => {
    if (session?.user?.name && !surveyorName) {
      setSurveyorName(session.user.name)
    }
  }, [session, surveyorName])

  // Build input object
  const quoteInput: FeeQuoteInput = useMemo(
    () => ({
      category,
      areaValue: Number(areaValue) || 0,
      areaUnit,
      resultantPlots: Number(resultantPlots) || 1,
      beaconsToSet: Number(beaconsToSet) || 0,
      distanceKm: Number(distanceKm) || 0,
      currency,
      includeVat,
      customMarkupPercent: Number(customMarkupPercent) || 0,
      clientName: clientName.trim() || undefined,
      projectName: projectName.trim() || undefined,
      lrNumber: lrNumber.trim() || undefined,
      surveyorName: surveyorName.trim() || undefined,
      firmName: firmName.trim() || undefined,
      iskNumber: iskNumber.trim() || undefined,
    }),
    [
      category,
      areaValue,
      areaUnit,
      resultantPlots,
      beaconsToSet,
      distanceKm,
      currency,
      includeVat,
      customMarkupPercent,
      clientName,
      projectName,
      lrNumber,
      surveyorName,
      firmName,
      iskNumber,
    ]
  )

  // Compute live quote
  const quoteResult = useMemo(() => computeSurveyFee(quoteInput), [quoteInput])

  // Format currency helper
  const fmt = (val: number) =>
    val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

  // Handle PDF download
  const handleDownloadPdf = async () => {
    setDownloadingPdf(true)
    try {
      const res = await fetch('/api/tools/fee-quotation/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteInput),
      })
      if (!res.ok) throw new Error('PDF generation failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Survey_Fee_Quotation_${(lrNumber || projectName || 'Quote').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert('Failed to generate proposal PDF. Please check details and try again.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  // Handle Copy WhatsApp summary
  const handleCopyWhatsApp = () => {
    const lines = [
      `*PROFESSIONAL SURVEY FEE QUOTATION*`,
      `*Firm:* ${firmName || 'Licensed Land Surveyor'}`,
      `*Surveyor:* ${surveyorName || 'Licensed Surveyor'} (${iskNumber || 'MISK'})`,
      `---------------------------------------`,
      `*Client:* ${clientName || 'Valued Client'}`,
      `*Project:* ${projectName || 'Boundary Survey'}`,
      `*LR / Parcel:* ${lrNumber || 'To be confirmed'}`,
      `*Extent:* ${quoteResult.areaHa.toFixed(2)} Ha (${quoteResult.areaAcres.toFixed(2)} Acres)`,
      `---------------------------------------`,
      `*FEE BREAKDOWN (${quoteResult.currency}):*`,
      ...quoteResult.items.map((i) => `• ${i.label}: ${quoteResult.currency} ${fmt(i.amount)}`),
      `---------------------------------------`,
      `*Subtotal:* ${quoteResult.currency} ${fmt(quoteResult.subtotal)}`,
      quoteResult.vatAmount > 0
        ? `*VAT (16%):* ${quoteResult.currency} ${fmt(quoteResult.vatAmount)}`
        : null,
      `*TOTAL PROPOSAL:* *${quoteResult.currency} ${fmt(quoteResult.totalAmount)}*`,
      `---------------------------------------`,
      `*PAYMENT MILESTONES:*`,
      ...quoteResult.milestones.map(
        (m) => `1. ${m.phase} (${m.percentage}%): ${quoteResult.currency} ${fmt(m.amount)}`
      ),
      `---------------------------------------`,
      `_Tariff compliant with Survey Act Cap 299 & SRB gazetted scale. Valid for 30 days._`,
    ].filter(Boolean)

    navigator.clipboard.writeText(lines.join('\n'))
    setCopiedSummary(true)
    setTimeout(() => setCopiedSummary(false), 2500)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/tools">Tools</BreadcrumbLink>
            </BreadcrumbItem>
              <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Survey Fee Quotation</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header Banner */}
        <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] text-xs font-semibold uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5" />
                Survey Act Cap 299 & SRB Gazetted Scale
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Statutory Scale of Fees & Client Proposal Generator
              </h1>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-3xl">
                Accurately quote clients using official Surveyors Registration Board (SRB) minimum
                tariffs, multi-currency conversion, itemized statutory disbursements, and 3-stage
                milestone schedules.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleCopyWhatsApp}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs sm:text-sm font-medium transition-colors"
                title="Copy formatted quotation for WhatsApp or Email"
              >
                {copiedSummary ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">Copied to Clipboard</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-[var(--accent)]" />
                    <span>Copy for WhatsApp</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-black font-semibold text-xs sm:text-sm hover:opacity-90 transition-opacity shadow-lg shadow-[color-mix(in_srgb,var(--accent)_20%,transparent)] disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{downloadingPdf ? 'Generating PDF...' : 'Download Official PDF'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Survey Category Switcher */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {CATEGORIES.map((cat) => {
            const isSelected = category === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-md ring-1 ring-[color-mix(in_srgb,var(--accent)_40%,transparent)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${
                      isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {cat.law}
                  </span>
                  {isSelected && <Check className="w-4 h-4 text-[var(--accent)]" />}
                </div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                  {cat.name}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                  {cat.desc}
                </p>
              </button>
            )
          })}
        </div>

        {/* Main 2-Column Workbench */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Inputs & Parameters (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* 1. Project & Land Metrics Box */}
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-6 space-y-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-[var(--accent)]" />
                  1. Statutory Physical Scope & Metrics
                </h2>
                <span className="text-xs text-[var(--text-secondary)]">Tariff Parameters</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Area Input */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Survey Extent (Area)
                  </label>
                  <div className="flex rounded-xl overflow-hidden border border-[var(--border-color)] bg-black/20 focus-within:border-[var(--accent)]">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={areaValue}
                      onChange={(e) => setAreaValue(parseFloat(e.target.value) || 0)}
                      className="w-full bg-transparent px-3 py-2 text-sm focus:outline-none"
                      placeholder="e.g. 2.5"
                    />
                    <div className="flex border-l border-[var(--border-color)] bg-white/5">
                      <button
                        type="button"
                        onClick={() => setAreaUnit('ha')}
                        className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                          areaUnit === 'ha'
                            ? 'bg-[var(--accent)] text-black'
                            : 'text-[var(--text-secondary)] hover:text-white'
                        }`}
                      >
                        Ha
                      </button>
                      <button
                        type="button"
                        onClick={() => setAreaUnit('acres')}
                        className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                          areaUnit === 'acres'
                            ? 'bg-[var(--accent)] text-black'
                            : 'text-[var(--text-secondary)] hover:text-white'
                        }`}
                      >
                        Acres
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                    Equiv: {quoteResult.areaHa.toFixed(2)} Ha ({quoteResult.areaAcres.toFixed(2)} Acres)
                  </p>
                </div>

                {/* Subdivisions Count */}
                {category === 'cadastral_subdivision' ? (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                      Resultant Sub-Plots
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={resultantPlots}
                      onChange={(e) => setResultantPlots(parseInt(e.target.value, 10) || 1)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                      placeholder="Number of resultant plots"
                    />
                    <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                      Statutory partition rate per sub-parcel
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                      Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code} className="bg-[var(--bg-secondary)]">
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                      Live statutory conversion rate applied
                    </p>
                  </div>
                )}

                {/* Beacons to Set */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Boundary Beacons (PSC/MB)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={beaconsToSet}
                    onChange={(e) => setBeaconsToSet(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                    placeholder="Concrete pillars with iron pins"
                  />
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                    Standard pre-cast or cast-in-situ pillars
                  </p>
                </div>

                {/* Mobilization Distance */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Mobilization Distance (km one-way)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={distanceKm}
                    onChange={(e) => setDistanceKm(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                    placeholder="Distance from office / base"
                  />
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                    Roundtrip transit: {(distanceKm * 2).toFixed(0)} km
                  </p>
                </div>
              </div>

              {/* Currency & Tax Options (if not already rendered) */}
              {category === 'cadastral_subdivision' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                      Proposal Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code} className="bg-[var(--bg-secondary)]">
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-color)] bg-white/5 mt-auto">
                    <div>
                      <div className="text-xs font-semibold">Include 16% VAT</div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        KRA Statutory Value Added Tax
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeVat}
                      onChange={(e) => setIncludeVat(e.target.checked)}
                      className="w-5 h-5 rounded border-[var(--border-color)] text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Complexity Allowance Slider */}
              <div className="pt-2 border-t border-[var(--border-color)]">
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Terrain & Boundary Dispute Complexity Allowance:
                  </label>
                  <span className="text-xs font-bold text-[var(--accent)]">
                    +{customMarkupPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="5"
                  value={customMarkupPercent}
                  onChange={(e) => setCustomMarkupPercent(parseInt(e.target.value, 10) || 0)}
                  className="w-full accent-[var(--accent)] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mt-1">
                  <span>Standard Flat Land (0%)</span>
                  <span>Steep Canopy (+25%)</span>
                  <span>Disputed / Extreme (+50%)</span>
                </div>
              </div>
            </div>

            {/* 2. Client & Practitioner Instruction Details */}
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-6 space-y-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Building className="w-4 h-4 text-[var(--accent)]" />
                  2. Instruction & Header Particulars
                </h2>
                <span className="text-xs text-[var(--text-secondary)]">Appears on Sealed Proposal</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Client Full Name / Company
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Samuel K. Mutua / Mwaniki Holdings"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Project / Assignment Title
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Kaputiei North Scheme Subdivision"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    LR / Parcel Number / Registration Block
                  </label>
                  <input
                    type="text"
                    value={lrNumber}
                    onChange={(e) => setLrNumber(e.target.value)}
                    placeholder="e.g. Kajiado/Kaputiei-North/1209"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Survey Practice / Firm Name
                  </label>
                  <input
                    type="text"
                    value={firmName}
                    onChange={(e) => setFirmName(e.target.value)}
                    placeholder="e.g. Metardu Geomatics & Engineering"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Practising Surveyor Name
                  </label>
                  <input
                    type="text"
                    value={surveyorName}
                    onChange={(e) => setSurveyorName(e.target.value)}
                    placeholder="e.g. Surv. John Kamau, MISK"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    ISK / SRB License Registration No.
                  </label>
                  <input
                    type="text"
                    value={iskNumber}
                    onChange={(e) => setIskNumber(e.target.value)}
                    placeholder="e.g. MISK/2026/0418"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Quotation Summary & Breakdown (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-6 space-y-6 shadow-xl sticky top-20">
              {/* Tabs */}
              <div className="flex border-b border-[var(--border-color)]">
                <button
                  onClick={() => setActiveTab('quote')}
                  className={`pb-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 flex-1 justify-center ${
                    activeTab === 'quote'
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Statutory Bill
                </button>
                <button
                  onClick={() => setActiveTab('milestones')}
                  className={`pb-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 flex-1 justify-center ${
                    activeTab === 'milestones'
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  Milestones (3-Tier)
                </button>
              </div>

              {activeTab === 'quote' ? (
                /* Itemized Table */
                <div className="space-y-4">
                  <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                    {quoteResult.items.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl border border-[var(--border-color)] bg-black/20 space-y-1 hover:border-white/20 transition-colors"
                      >
                        <div className="flex justify-between items-start text-xs">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {idx + 1}. {item.label}
                          </span>
                          <span className="font-mono font-bold text-[var(--text-primary)]">
                            {quoteResult.currency} {fmt(item.amount)}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                          {item.description}
                        </p>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {item.quantity} {item.unit} @ {quoteResult.currency} {fmt(item.rate)}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="border-t border-[var(--border-color)] pt-4 space-y-2">
                    <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                      <span>Subtotal (Net Professional Fees):</span>
                      <span className="font-mono">
                        {quoteResult.currency} {fmt(quoteResult.subtotal)}
                      </span>
                    </div>

                    {quoteResult.vatAmount > 0 && (
                      <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                        <span>Statutory VAT (16%):</span>
                        <span className="font-mono">
                          {quoteResult.currency} {fmt(quoteResult.vatAmount)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-baseline pt-2 border-t border-[var(--border-color)]">
                      <span className="text-sm font-bold text-[var(--text-primary)]">
                        Total Quotation:
                      </span>
                      <div className="text-right">
                        <span className="text-xl sm:text-2xl font-black text-[var(--accent)] font-mono">
                          {quoteResult.currency} {fmt(quoteResult.totalAmount)}
                        </span>
                        <div className="text-[10px] text-emerald-400 font-medium">
                          SRB Gazetted Scale Compliant
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Milestones View */
                <div className="space-y-4">
                  <div className="space-y-3">
                    {quoteResult.milestones.map((m, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl border border-[var(--border-color)] bg-black/20 space-y-2"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] text-xs font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold">{m.phase}</span>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 font-mono font-bold">
                            {m.percentage}%
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                          {m.description}
                        </p>
                        <div className="text-right font-mono font-bold text-sm text-[var(--accent)]">
                          {quoteResult.currency} {fmt(m.amount)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 leading-relaxed">
                    <Info className="mr-1 inline h-4 w-4" aria-hidden="true" /> <strong className="font-semibold">Professional Practice Tip:</strong> Under
                    SRB practice guidelines, mobilizing field survey crews before receipt of the
                    50% initial disbursement is strongly discouraged.
                  </div>
                </div>
              )}

              {/* Bottom CTAs */}
              <div className="pt-2 space-y-2">
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="w-full py-3 rounded-xl bg-[var(--accent)] text-black font-bold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-[color-mix(in_srgb,var(--accent)_20%,transparent)] disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{downloadingPdf ? 'Compiling Official Proposal...' : 'Download Sealed PDF Proposal'}</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCopyWhatsApp}
                    className="py-2 px-3 rounded-xl border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                  >
                    {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSummary ? 'Copied!' : 'Copy Summary'}</span>
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="py-2 px-3 rounded-xl border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Direct</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
