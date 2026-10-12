/**
 * surveyFeeCalculator.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Computes professional survey fees compliant with the Survey Act Cap 299
 * and the Surveyors Registration Board (SRB) gazetted Scale of Minimum Fees.
 *
 * Supports East African and international multi-currency conversions.
 */

export type SurveyCategory =
  | 'cadastral_subdivision'
  | 'boundary_reestablishment'
  | 'topographic_survey'
  | 'engineering_road'
  | 'title_survey'

export type CurrencyCode = 'KES' | 'USD' | 'EUR' | 'GBP' | 'TZS' | 'UGX'

export interface FeeQuoteInput {
  category: SurveyCategory
  areaValue: number
  areaUnit: 'ha' | 'acres'
  resultantPlots: number
  beaconsToSet: number
  distanceKm: number
  currency: CurrencyCode
  includeVat: boolean
  customMarkupPercent?: number
  clientName?: string
  projectName?: string
  lrNumber?: string
  surveyorName?: string
  firmName?: string
  iskNumber?: string
}

export interface FeeItem {
  id: string
  label: string
  description: string
  quantity: number
  unit: string
  rate: number
  amount: number
}

export interface FeeQuoteResult {
  category: SurveyCategory
  areaHa: number
  areaAcres: number
  currency: CurrencyCode
  exchangeRate: number
  items: FeeItem[]
  subtotal: number
  vatAmount: number
  totalAmount: number
  milestones: Array<{
    phase: string
    percentage: number
    amount: number
    description: string
  }>
}

// Exchange rates relative to KES
const EXCHANGE_RATES: Record<CurrencyCode, number> = {
  KES: 1,
  USD: 1 / 130,
  EUR: 1 / 140,
  GBP: 1 / 165,
  TZS: 20,
  UGX: 28,
}

export function computeSurveyFee(input: FeeQuoteInput): FeeQuoteResult {
  const areaHa = input.areaUnit === 'ha' ? input.areaValue : input.areaValue * 0.404686
  const areaAcres = input.areaUnit === 'acres' ? input.areaValue : input.areaValue / 0.404686
  const currencyRate = EXCHANGE_RATES[input.currency] || 1

  const items: FeeItem[] = []

  // 1. Base Statutory Survey Fee (KES)
  let baseFeeKes = 40000
  let baseDescription = 'Initial cadastral survey & statutory reconnaissance'
  if (input.category === 'boundary_reestablishment') {
    baseFeeKes = 35000
    baseDescription = 'Boundary mark recovery, beacon verification & control check'
  } else if (input.category === 'topographic_survey') {
    baseFeeKes = 45000
    baseDescription = 'Topographic ground control, spot heighting & datum setup'
  } else if (input.category === 'engineering_road') {
    baseFeeKes = 55000
    baseDescription = 'Centerline alignment, profile leveling & bench mark establishment'
  } else if (input.category === 'title_survey') {
    baseFeeKes = 50000
    baseDescription = 'Statutory title boundary survey & deed plan preparation'
  }

  items.push({
    id: 'base_charge',
    label: 'Statutory Base Survey Charge',
    description: baseDescription,
    quantity: 1,
    unit: 'lump sum',
    rate: baseFeeKes * currencyRate,
    amount: baseFeeKes * currencyRate,
  })

  // 2. Acreage / Area Sliding Scale Fee
  let areaRatePerHaKes = 6000
  if (areaHa > 20) {
    areaRatePerHaKes = 3000
  } else if (areaHa > 5) {
    areaRatePerHaKes = 4500
  }

  const billableHa = Math.max(1, areaHa)
  const areaAmountKes = billableHa * areaRatePerHaKes

  items.push({
    id: 'area_rate',
    label: 'Acreage Sliding Scale Fee',
    description: `Sliding scale rate for ${areaHa.toFixed(2)} Ha (${areaAcres.toFixed(2)} Acres)`,
    quantity: parseFloat(areaHa.toFixed(2)),
    unit: 'Ha',
    rate: areaRatePerHaKes * currencyRate,
    amount: areaAmountKes * currencyRate,
  })

  // 3. Subdivisions / Resultant Plots
  if (input.category === 'cadastral_subdivision' && input.resultantPlots > 1) {
    const plotRateKes = 8500
    const plotsCount = input.resultantPlots
    const plotsAmountKes = plotsCount * plotRateKes

    items.push({
      id: 'subdivisions',
      label: 'Resultant Sub-Plot Partition Fee',
      description: `Surveying and partition of ${plotsCount} individual parcel units`,
      quantity: plotsCount,
      unit: 'plots',
      rate: plotRateKes * currencyRate,
      amount: plotsAmountKes * currencyRate,
    })
  }

  // 4. Beacon Placement & Materials (Concrete Beacons)
  if (input.beaconsToSet > 0) {
    const beaconRateKes = 3500
    const beaconAmountKes = input.beaconsToSet * beaconRateKes

    items.push({
      id: 'beacons',
      label: 'Boundary Beacon Setting & Materials',
      description: 'Standard concrete survey beacons (PSC/MB) with iron pin, sand, cement & labor',
      quantity: input.beaconsToSet,
      unit: 'beacons',
      rate: beaconRateKes * currencyRate,
      amount: beaconAmountKes * currencyRate,
    })
  }

  // 5. Statutory Registry Search & RIM Acquisition
  const registrySearchKes = 4500
  items.push({
    id: 'registry_search',
    label: 'Land Registry Search & Registry Index Map (RIM)',
    description: 'Official land registry search, Folio Reference verification & RIM extract',
    quantity: 1,
    unit: 'disbursement',
    rate: registrySearchKes * currencyRate,
    amount: registrySearchKes * currencyRate,
  })

  // 6. Mutation Form & Statutory Lodgement (Cadastral only)
  if (input.category === 'cadastral_subdivision' || input.category === 'boundary_reestablishment') {
    const mutationLodgementKes = 12500
    items.push({
      id: 'mutation_lodgement',
      label: 'Mutation Form & Plan Lodgement',
      description: 'Form LRA 27 preparation, statutory computation sheets & Director of Surveys lodgement',
      quantity: 1,
      unit: 'filing',
      rate: mutationLodgementKes * currencyRate,
      amount: mutationLodgementKes * currencyRate,
    })
  }

  // 7. Travel, Mileage & Mobilization
  if (input.distanceKm > 0) {
    const mileageRateKes = 100 // KES per KM round trip
    const totalMileageKm = input.distanceKm * 2
    const mileageAmountKes = totalMileageKm * mileageRateKes

    items.push({
      id: 'mobilization',
      label: 'Transport, Mileage & Field Mobilization',
      description: `Field crew & instrument transit (${totalMileageKm} km roundtrip @ ${mileageRateKes} KES/km)`,
      quantity: totalMileageKm,
      unit: 'km',
      rate: mileageRateKes * currencyRate,
      amount: mileageAmountKes * currencyRate,
    })
  }

  // Custom markup if provided
  if (input.customMarkupPercent && input.customMarkupPercent > 0) {
    const currentSubtotal = items.reduce((sum, item) => sum + item.amount, 0)
    const markupAmount = currentSubtotal * (input.customMarkupPercent / 100)
    items.push({
      id: 'complexity_markup',
      label: 'Terrain & Complexity Professional Allowance',
      description: `Steep terrain, dense canopy or boundary dispute complexity (+${input.customMarkupPercent}%)`,
      quantity: 1,
      unit: 'allowance',
      rate: markupAmount,
      amount: markupAmount,
    })
  }

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0)
  const vatAmount = input.includeVat ? subtotal * 0.16 : 0
  const totalAmount = subtotal + vatAmount

  // Standard 3-tier milestone structure
  const milestones = [
    {
      phase: 'Deposit / Mobilization',
      percentage: 50,
      amount: totalAmount * 0.5,
      description: 'Upon instruction signing, registry search, and field crew mobilization.',
    },
    {
      phase: 'Fieldwork Completion',
      percentage: 30,
      amount: totalAmount * 0.3,
      description: 'Upon completion of field observations, beacon placement, and traverse closure check.',
    },
    {
      phase: 'Statutory Approval & Delivery',
      percentage: 20,
      amount: totalAmount * 0.2,
      description: 'Upon Land Registry approval, deed plan authentication, and delivery of sealed submission package.',
    },
  ]

  return {
    category: input.category,
    areaHa,
    areaAcres,
    currency: input.currency,
    exchangeRate: currencyRate,
    items,
    subtotal,
    vatAmount,
    totalAmount,
    milestones,
  }
}
