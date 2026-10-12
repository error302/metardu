import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import type { NLIMSSearchResult, NLIMSParcel } from '@/types/nlims'

// ─── DB Row Interfaces ───────────────────────────────────────────────────
interface ParcelVaultRow {
  parcel_number: string
  user_id: string
  parsed_data: unknown
  freshness: string | null
  certificate_date: string | null
}

interface ParcelVaultSharedRow {
  parcel_number: string
  registration_section: string | null
  county: string
  area_sqm: number | null
  title_deed_number: string | null
  certificate_date: string | null
  status: string | null
  freshness: string | null
}

interface NlimsCacheRow {
  parcel_number: string
  county: string
  data: unknown
  fetched_at: string
}

export const dynamic = 'force-dynamic'

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' },
  })
}

export const GET = apiHandler({ auth: true, rateLimit: { max: 30, windowMs: 60000 } }, async (request, ctx) => {
  const { searchParams } = new URL(request.url)
  const parcelNumber = searchParams.get('parcel')
  const county = searchParams.get('county')

  if (!parcelNumber) {
    return privateJson({ found: false, error: 'Parcel number is required' } as NLIMSSearchResult, 400)
  }

  const sanitizedParcel = parcelNumber.trim().toUpperCase().replace(/\s+/g, '')
  if (sanitizedParcel.length > 100 || /[\u0000-\u001f\u007f]/.test(sanitizedParcel)) {
    return privateJson({ found: false, error: 'Parcel number must be 1–100 printable characters.' } as NLIMSSearchResult, 400)
  }
  if (county && (county.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(county))) {
    return privateJson({ found: false, error: 'County must be at most 80 printable characters.' } as NLIMSSearchResult, 400)
  }
  // Use authenticated user ID from session (not query param — security fix)
  const userId = ctx.userId

  // 1. Check personal vault
  const personalVault = await db.query<ParcelVaultRow>(
    'SELECT * FROM parcel_vault WHERE parcel_number = $1 AND user_id = $2',
    [sanitizedParcel, userId]
  )

  if (personalVault.rows.length > 0) {
    const vault = personalVault.rows[0]
    return privateJson({
      found: true,
      parcel: vault.parsed_data as NLIMSParcel,
      source: 'VAULT_PERSONAL',
      freshness: vault.freshness ?? undefined,
      certificateDate: vault.certificate_date ?? undefined
    } as NLIMSSearchResult)
  }

  // 2. Check shared vault
  const sharedVault = await db.query<ParcelVaultSharedRow>(
    'SELECT * FROM parcel_vault_shared WHERE parcel_number = $1',
    [sanitizedParcel]
  )

  if (sharedVault.rows.length > 0) {
    const sv = sharedVault.rows[0]
    const sharedReference: NLIMSParcel = {
      parcelNumber: sv.parcel_number,
      registrationSection: sv.registration_section || '',
      county: sv.county,
      area: sv.area_sqm || 0,
      areaHectares: (sv.area_sqm || 0) / 10000,
      ownerName: '[Community Shared - Owner Hidden]',
      ownerType: 'INDIVIDUAL',
      titleDeedNumber: sv.title_deed_number || '',
      titleDeedDate: sv.certificate_date || '',
      encumbrances: [],
      status: (sv.status as 'REGISTERED' | 'PENDING' | 'DISPUTED' | 'CANCELLED' | null) || 'REGISTERED',
      lastTransactionDate: sv.certificate_date || '',
      lastTransactionType: 'SEARCH',
      source: 'VAULT_SHARED',
      fetchedAt: new Date().toISOString()
    }
    return privateJson({
      found: true,
      parcel: sharedReference,
      source: 'VAULT_SHARED',
      freshness: sv.freshness ?? undefined,
      certificateDate: sv.certificate_date ?? undefined
    } as NLIMSSearchResult)
  }

  // 3. Check NLIMS cache (24h freshness)
  const cached = await db.query<NlimsCacheRow>(
    'SELECT data, fetched_at FROM nlims_cache WHERE parcel_number = $1 AND county = $2',
    [sanitizedParcel, county || '']
  )

  if (cached.rows.length > 0) {
    const row = cached.rows[0]
    const cacheAge = Date.now() - new Date(row.fetched_at).getTime()
    const oneDay = 24 * 60 * 60 * 1000

    if (cacheAge < oneDay) {
      return privateJson({
        found: true,
        parcel: row.data as NLIMSParcel,
        source: 'METARDU_CACHE',
        freshness: `Cached record retrieved ${row.fetched_at}`,
      } as NLIMSSearchResult)
    }
  }

  // No public registry API contract is configured. A local miss is not proof
  // that a parcel is absent from the government register.
  return privateJson({
    found: false,
    code: 'OFFICIAL_REGISTRY_ACCESS_UNAVAILABLE',
    error: 'No matching record is available in METARDU records. Live government registry search is not connected; this does not mean the parcel is absent from the official register.',
  } as NLIMSSearchResult, 503)
})
