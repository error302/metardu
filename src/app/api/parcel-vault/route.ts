import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { saveToVault, getUserVault, getVaultStats, deleteVaultEntry, type ParcelVaultEntry, type VaultStats } from '@/lib/supabase/parcelVault'
import type { NLIMSParcel } from '@/types/nlims'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { data: entries, error } = await supabase
      .from('parcel_vault')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ vault: entries || [] })

  } catch (error) {
    console.error('Vault GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body = await request.json()
    const { parcel, certificateDate, pdfPath, share } = body as {
      parcel: NLIMSParcel
      certificateDate: string
      pdfPath?: string
      share?: boolean
    }

    if (!parcel || !certificateDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    await saveToVault(parcel, certificateDate, pdfPath || '', share || false, user.id)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Vault POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const parcelNumber = searchParams.get('parcel')

    if (!parcelNumber) {
      return NextResponse.json({ error: 'Parcel number required' }, { status: 400 })
    }

    await deleteVaultEntry(parcelNumber, user.id)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Vault DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
