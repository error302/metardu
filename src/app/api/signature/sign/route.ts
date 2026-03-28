import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashDocument, generateVerificationToken } from '@/lib/compute/digitalSignature'
import type { SignDocumentRequest } from '@/types/signature'

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

    const body: SignDocumentRequest = await request.json()
    const { documentId, documentType, content, method, signatureData } = body

    if (!documentId || !documentType || !content || !method) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, isk_number, firm_name')
      .eq('id', user.id)
      .single()

    const surveyorName = profile?.full_name || 'Unknown Surveyor'
    const iskNumber = profile?.isk_number || 'ISK/0000'
    const firmName = profile?.firm_name || 'Independent Surveyor'

    const documentHash = hashDocument(content)
    const signedAt = new Date().toISOString()
    const verificationToken = generateVerificationToken(documentId, signedAt, iskNumber)

    const { data: signature, error: insertError } = await supabase
      .from('document_signatures')
      .insert({
        document_id: documentId,
        document_type: documentType,
        signed_by: user.id,
        surveyor_name: surveyorName,
        isk_number: iskNumber,
        firm_name: firmName,
        signed_at: signedAt,
        document_hash: documentHash,
        signature_data: signatureData || '',
        method: method,
        valid: true,
        verification_token: verificationToken
      })
      .select()
      .single()

    if (insertError) {
      console.error('Signature insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to save signature' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      signatureId: signature.id,
      verificationToken: signature.verification_token,
      documentHash
    })

  } catch (error) {
    console.error('Sign document error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
