import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import type { NLIMSSearchResult, NLIMSParcel } from '@/types/nlims'

export const dynamic = 'force-dynamic'

// NLIMS integration is pending — generateMockParcel removed.
// Once the NLIMS API is connected, a real lookup function will replace this.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const parcelNumber = searchParams.get('parcel')
    const county = searchParams.get('county')
    const userId = searchParams.get('userId')

    if (!parcelNumber) {
      return NextResponse.json(
        { found: false, error: 'Parcel number is required', isMockData: false } as NLIMSSearchResult,
        { status: 400 }
      )
    }

    const sanitizedParcel = parcelNumber.trim().toUpperCase().replace(/\s+/g, '')

    if (userId) {
      const personalVault = await db.query(
        'SELECT * FROM parcel_vault WHERE parcel_number = $1 AND user_id = $2',
        [sanitizedParcel, userId]
      )

      if (personalVault.rows.length > 0) {
        const vault = personalVault.rows[0]
        return NextResponse.json({
          found: true,
          parcel: vault.parsed_data as NLIMSParcel,
          isMockData: false,
          source: 'VAULT_PERSONAL',
          freshness: vault.freshness,
          certificateDate: vault.certificate_date
        } as NLIMSSearchResult & { source?: string; freshness?: string; certificateDate?: string })
      }

      const sharedVault = await db.query(
        'SELECT * FROM parcel_vault_shared WHERE parcel_number = $1',
        [sanitizedParcel]
      )

      if (sharedVault.rows.length > 0) {
        const sv = sharedVault.rows[0]
        const mockFromVault: NLIMSParcel = {
          parcelNumber: sv.parcel_number,
          registrationSection: sv.registration_section || '',
          county: sv.county,
          area: sv.area_sqm || 0,
          areaHectares: (sv.area_sqm || 0) / 10000,
          ownerName: '[Community Shared - Owner Hidden]',
          ownerType: 'INDIVIDUAL',
          titleDeedNumber: sv.title_deed_number || '',
          titleDeedDate: sv.certificate_date,
          encumbrances: [],
          status: (sv.status as 'REGISTERED' | 'PENDING' | 'DISPUTED' | 'CANCELLED') || 'REGISTERED',
          lastTransactionDate: sv.certificate_date,
          lastTransactionType: 'SEARCH',
          source: 'VAULT_SHARED',
          fetchedAt: new Date().toISOString()
        }
        return NextResponse.json({
          found: true,
          parcel: mockFromVault,
          isMockData: true,
          source: 'VAULT_SHARED',
          freshness: sv.freshness,
          certificateDate: sv.certificate_date
        } as NLIMSSearchResult & { source?: string; freshness?: string; certificateDate?: string })
      }
    }

    const cached = await db.query(
      'SELECT data, fetched_at FROM nlims_cache WHERE parcel_number = $1 AND county = $2',
      [sanitizedParcel, county || '']
    )

    if (cached.rows.length > 0) {
      const row = cached.rows[0]
      const cacheAge = Date.now() - new Date(row.fetched_at).getTime()
      const oneDay = 24 * 60 * 60 * 1000

      if (cacheAge < oneDay) {
        return NextResponse.json({
          found: true,
          parcel: row.data as NLIMSParcel,
          isMockData: row.data?.source === 'NLIMS_CACHED'
        } as NLIMSSearchResult)
      }
    }

    const apiKey = process.env.NLIMS_API_KEY

    if (!apiKey) {
      // NLIMS integration is pending — no API key configured.
      return NextResponse.json(
        { found: false, error: 'NLIMS integration is pending — no API key configured', isMockData: false } as NLIMSSearchResult,
        { status: 503 }
      )
    }

    try {
      const response = await fetch('https://api.ardhi.go.ke/nlims/v1/parcel/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parcelNumber: sanitizedParcel, county: county || '' })
      })

      if (response.ok) {
        const data = await response.json()
        const parcel: NLIMSParcel = {
          ...data,
          source: 'NLIMS_LIVE',
          fetchedAt: new Date().toISOString()
        }

        await db.query(
          `INSERT INTO nlims_cache (parcel_number, county, data, fetched_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (parcel_number, county) DO UPDATE SET data = $3, fetched_at = $4`,
          [sanitizedParcel, county || '', parcel, new Date().toISOString()]
        )

        return NextResponse.json({
          found: true,
          parcel,
          isMockData: false
        } as NLIMSSearchResult)
      }
    } catch (apiError) {
      console.error('NLIMS API error:', apiError)
    }

    // NLIMS API call failed — no fallback mock data.
    return NextResponse.json(
      { found: false, error: 'Parcel not found via NLIMS API', isMockData: false } as NLIMSSearchResult,
      { status: 404 }
    )

  } catch (error) {
    console.error('NLIMS lookup error:', error)
    return NextResponse.json(
      { found: false, error: 'Failed to lookup parcel', isMockData: false } as NLIMSSearchResult,
      { status: 500 }
    )
  }
}
