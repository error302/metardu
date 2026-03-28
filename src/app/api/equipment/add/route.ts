import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { CreateEquipmentRequest } from '@/types/equipment'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

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

    const body: CreateEquipmentRequest & { calibrationInterval?: number } = await request.json()

    const {
      name,
      type,
      make,
      model,
      serialNumber,
      purchaseDate,
      lastCalibrationDate,
      calibrationInterval = 12,
      calibrationCertNumber,
      calibrationLab,
      notes
    } = body

    if (!name || !type || !make || !model || !serialNumber || !lastCalibrationDate) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const lastCal = new Date(lastCalibrationDate)
    const nextDue = new Date(lastCal)
    nextDue.setMonth(nextDue.getMonth() + calibrationInterval)

    const { data, error } = await supabase
      .from('equipment')
      .insert({
        user_id: user.id,
        name,
        type,
        make,
        model,
        serial_number: serialNumber,
        purchase_date: purchaseDate,
        last_calibration: lastCal.toISOString().split('T')[0],
        next_calibration_due: nextDue.toISOString().split('T')[0],
        calibration_interval: calibrationInterval,
        cert_number: calibrationCertNumber,
        calibration_lab: calibrationLab,
        notes
      })
      .select()
      .single()

    if (error) {
      console.error('Equipment insert error:', error)
      return NextResponse.json(
        { error: 'Failed to add equipment' },
        { status: 500 }
      )
    }

    return NextResponse.json({ equipmentId: data.id })

  } catch (error) {
    console.error('Add equipment error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
