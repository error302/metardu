import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { CreateCalibrationRecordRequest } from '@/types/equipment'

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

    const body: { equipmentId: string } & CreateCalibrationRecordRequest = await request.json()
    const { equipmentId, date, certNumber, lab, technician, result, findings, corrections, nextDueDate, documentPath } = body

    if (!equipmentId || !date || !nextDueDate) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const { data: equipment, error: ownerError } = await supabase
      .from('equipment')
      .select('user_id')
      .eq('id', equipmentId)
      .single()

    if (ownerError || !equipment || equipment.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Equipment not found or access denied' },
        { status: 403 }
      )
    }

    const { data, error } = await supabase
      .from('calibration_records')
      .insert({
        equipment_id: equipmentId,
        date: date,
        cert_number: certNumber,
        lab: lab,
        technician: technician,
        result: result,
        findings: findings,
        corrections: corrections,
        next_due_date: nextDueDate,
        document_path: documentPath
      })
      .select()
      .single()

    if (error) {
      console.error('Calibration insert error:', error)
      return NextResponse.json(
        { error: 'Failed to add calibration record' },
        { status: 500 }
      )
    }

    await supabase
      .from('equipment')
      .update({
        last_calibration: date,
        next_calibration_due: nextDueDate,
        cert_number: certNumber,
        calibration_lab: lab
      })
      .eq('id', equipmentId)

    return NextResponse.json({ recordId: data.id })

  } catch (error) {
    console.error('Add calibration error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
