/**
 * AI Chat Endpoint - NVIDIA NIM
 * Handles survey data QA, report generation, and assistance
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { chat, checkSurveyDataQA, extractCoordinates, generateReportSection, validateSurveyResults } from '@/lib/ai/nvidiaService'
import { z } from 'zod'

const requestSchema = z.object({
  action: z.enum(['chat', 'survey-qa', 'extract-coords', 'generate-section', 'validate-results']),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })).optional(),
  data: z.any().optional(),
  options: z.any().optional(),
})

export async function POST(request: Request) {
  try {
    // Auth check
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = requestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.errors }, { status: 400 })
    }

    const { action, messages, data, options } = parsed.data

    if (action === 'chat') {
      // General chat
      if (!messages?.length) {
        return NextResponse.json({ error: 'Messages required' }, { status: 400 })
      }

      const response = await chat({ messages, ...options })
      return NextResponse.json({ response })
    }

    if (action === 'survey-qa') {
      // Survey data QA
      const result = await checkSurveyDataQA(data)
      return NextResponse.json({ result })
    }

    if (action === 'extract-coords') {
      // Extract coordinates from text
      const text = data?.text || ''
      const result = await extractCoordinates(text)
      return NextResponse.json(result)
    }

    if (action === 'generate-section') {
      // Generate report section
      const { sectionType, surveyType, projectData, customInstructions } = data || {}
      const result = await generateReportSection({
        sectionType,
        surveyType,
        projectData,
        customInstructions,
      })
      return NextResponse.json({ result })
    }

    if (action === 'validate-results') {
      // Validate survey results
      const { surveyType, measured, expected, tolerances } = data || {}
      const result = await validateSurveyResults({
        surveyType,
        measured,
        expected,
        tolerances,
      })
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error: any) {
    console.error('AI chat error:', error)
    return NextResponse.json(
      { error: error.message || 'AI service error' },
      { status: 500 }
    )
  }
}

// GET endpoint to check if AI is configured
export async function GET() {
  const isConfigured = !!process.env.NVIDIA_API_KEY
  return NextResponse.json({
    configured: isConfigured,
    models: ['meta/llama-3.1-70b-instruct'],
  })
}
