import { createClient } from '@supabase/supabase-js'
import type { CPDRecord, CPDCertificate, CPDActivity } from '@/types/cpd'
import { CPD_POINTS } from '@/types/cpd'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

function generateVerificationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export async function awardCPDPoints(
  userId: string,
  activity: CPDActivity,
  description: string,
  referenceId?: string,
  customPoints?: number
): Promise<string> {
  const points = customPoints ?? CPD_POINTS[activity]
  
  const { data, error } = await supabase
    .from('cpd_records')
    .insert({
      user_id: userId,
      activity,
      points,
      description,
      reference_id: referenceId,
      verifiable: true
    })
    .select()
    .single()

  if (error) throw error
  return data.id
}

export async function getUserCPDForYear(userId: string, year: number): Promise<CPDRecord[]> {
  const startDate = new Date(year, 0, 1).toISOString()
  const endDate = new Date(year, 11, 31, 23, 59, 59).toISOString()

  const { data, error } = await supabase
    .from('cpd_records')
    .select('*')
    .eq('user_id', userId)
    .gte('earned_at', startDate)
    .lte('earned_at', endDate)
    .order('earned_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getTotalCPDForYear(userId: string, year: number): Promise<number> {
  const records = await getUserCPDForYear(userId, year)
  return records.reduce((sum, r) => sum + r.points, 0)
}

export async function generateCPDCertificate(
  userId: string,
  year: number,
  surveyorName: string,
  iskNumber: string
): Promise<CPDCertificate> {
  const records = await getUserCPDForYear(userId, year)
  const totalPoints = records.reduce((sum, r) => sum + r.points, 0)
  const verificationCode = generateVerificationCode()

  const { data, error } = await supabase
    .from('cpd_certificates')
    .insert({
      user_id: userId,
      year,
      total_points: totalPoints,
      verification_code: verificationCode
    })
    .select()
    .single()

  if (error) throw error

  return {
    id: data.id,
    userId,
    surveyorName,
    iskNumber,
    year,
    totalPoints,
    activities: records,
    generatedAt: data.generated_at,
    verificationCode
  }
}

export async function verifyCPDCertificate(code: string): Promise<CPDCertificate | null> {
  const { data, error } = await supabase
    .from('cpd_certificates')
    .select('*, cpd_records(*), profiles!inner(full_name, isk_number)')
    .eq('verification_code', code.toUpperCase())
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    userId: data.user_id,
    surveyorName: data.profiles?.full_name || 'Unknown',
    iskNumber: data.profiles?.isk_number || 'N/A',
    year: data.year,
    totalPoints: data.total_points,
    activities: data.cpd_records || [],
    generatedAt: data.generated_at,
    verificationCode: data.verification_code,
    pdfPath: data.pdf_path
  }
}
