/**
 * AI Chat Endpoint — NVIDIA NIM
 * Handles survey data QA, report generation, and assistance.
 *
 * Phase 4 improvements:
 * - Rate limiting (20 AI calls per minute per user)
 * - AI usage tracking (decrements ai_calls_remaining on each call)
 * - SSE streaming for report generation
 * - Security: API key never logged or exposed in responses
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  chat,
  chatStream,
  checkSurveyDataQA,
  extractCoordinates,
  generateReportSection,
  validateSurveyResults,
  interpretFieldPhoto,
  isConfigured,
} from '@/lib/ai/nvidiaService'
import { rateLimit, getClientIdentifier } from '@/lib/security/rateLimit'
import { db, setCurrentUserId } from '@/lib/db'
import { z } from 'zod'

// ─── Rate limiting: 20 AI requests per minute per user ────────────────────────
const AI_RATE_LIMIT = { max: 20, windowMs: 60_000 }

// ─── AI usage limits per tier ─────────────────────────────────────────────────
const TIER_LIMITS: Record<string, number> = {
  free: 10,
  pro: 100,
  team: 500,
  firm: 500,
  enterprise: Infinity,
}

// Admin emails get unlimited AI calls
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())

// ─── Request schema ───────────────────────────────────────────────────────────

const requestSchema = z.object({
  action: z.enum(['chat', 'survey-qa', 'extract-coords', 'generate-section', 'validate-results', 'interpret-field-photo']),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })).optional(),
  data: z.any().optional(),
  options: z.any().optional(),
  /** If true, response is streamed via SSE (only for generate-section) */
  stream: z.boolean().optional(),
})

// ─── AI usage tracking ────────────────────────────────────────────────────────

async function decrementAiCalls(userId: string, email?: string): Promise<{ remaining: number; limit: number }> {
  // Admin users get unlimited AI calls — skip decrement entirely
  const isFounder = email?.toLowerCase() === 'mohameddosho20@gmail.com'
  const isAdmin = isFounder || (email ? ADMIN_EMAILS.includes(email.toLowerCase()) : false)
  if (isAdmin) {
    return { remaining: Infinity, limit: Infinity }
  }

  try {
    // Get current usage — use SELECT FOR UPDATE to prevent race conditions
    const profile = await db.query(
      'SELECT ai_calls_remaining, tier FROM profiles WHERE user_id = $1 FOR UPDATE',
      [userId]
    )

    if (profile.rows.length === 0) {
      // No profile yet — FAIL CLOSED: deny the call until profile exists
      console.error('[ai/chat] No profile found for user — blocking AI call (fail-closed)')
      return { remaining: 0, limit: TIER_LIMITS.free }
    }

    const { ai_calls_remaining, tier } = profile.rows[0]
    const limit = TIER_LIMITS[tier] || TIER_LIMITS.free

    const currentRemaining = ai_calls_remaining ?? limit

    // If already at 0, deny before decrementing
    if (currentRemaining <= 0) {
      return { remaining: 0, limit }
    }

    // Decrement remaining (but never below 0)
    const newRemaining = Math.max(0, currentRemaining - 1)
    await db.query(
      'UPDATE profiles SET ai_calls_remaining = $1 WHERE user_id = $2',
      [newRemaining, userId]
    )

    return { remaining: newRemaining, limit }
  } catch (err) {
    // FAIL CLOSED: If DB is down, deny ALL AI calls to prevent unlimited usage
    console.error('[ai/chat] Usage tracking failed — BLOCKING AI call (fail-closed):', err)
    return { remaining: 0, limit: 0 }
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as { id?: string }).id
    if (!userId) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // Set RLS context so PostgreSQL current_user_id() works for subsequent DB queries
    setCurrentUserId(String(userId))

    // 2. Rate limiting
    const identifier = `ai:${userId}`
    const { allowed, remaining: rlRemaining } = await rateLimit(identifier, AI_RATE_LIMIT.max, AI_RATE_LIMIT.windowMs)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many AI requests. Please wait a minute.', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'X-RateLimit-Remaining': String(rlRemaining) } }
      )
    }

    // 3. AI usage check (tier-based)
    const userEmail = (session.user as { email?: string }).email
    const usage = await decrementAiCalls(userId, userEmail)
    if (usage.remaining <= 0) {
      return NextResponse.json(
        {
          error: 'AI call limit reached for your plan. Upgrade to Pro for more calls.',
          code: 'AI_LIMIT_REACHED',
          tier: usage.limit,
        },
        { status: 403 }
      )
    }

    // 4. Parse request
    const body = await request.json().catch(() => ({}))
    const parsed = requestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.errors }, { status: 400 })
    }

    const { action, messages, data, options, stream: useStream } = parsed.data

    // 5. Route to action
    if (action === 'chat') {
      if (!messages?.length) {
        return NextResponse.json({ error: 'Messages required' }, { status: 400 })
      }
      const response = await chat({ messages, ...options })
      return NextResponse.json({ response, callsRemaining: usage.remaining })
    }

    if (action === 'survey-qa') {
      const result = await checkSurveyDataQA(data)
      return NextResponse.json({ result, callsRemaining: usage.remaining })
    }

    if (action === 'extract-coords') {
      const text = data?.text || ''
      const result = await extractCoordinates(text)
      return NextResponse.json({ ...result, callsRemaining: usage.remaining })
    }

    if (action === 'generate-section') {
      const { sectionType, surveyType, projectData, customInstructions } = data || {}

      // Streaming response via SSE
      if (useStream) {
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          async start(controller) {
            try {
              const fullText = await generateReportSection({
                sectionType,
                surveyType,
                projectData,
                customInstructions,
                onToken: (token) => {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`))
                },
              })
              // Send done signal
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, callsRemaining: usage.remaining })}\n\n`))
              controller.close()
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Streaming failed'
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`))
              controller.close()
            }
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      }

      // Non-streaming (backward compatible)
      const result = await generateReportSection({
        sectionType,
        surveyType,
        projectData,
        customInstructions,
      })
      return NextResponse.json({ result, callsRemaining: usage.remaining })
    }

    if (action === 'validate-results') {
      const { surveyType, measured, expected, tolerances } = data || {}
      const result = await validateSurveyResults({ surveyType, measured, expected, tolerances })
      return NextResponse.json({
        ...result,
        _safety: 'AI_ASSESSMENT_NOT_AUTHORITATIVE',
        _authoritative_source: 'toleranceEngine (deterministic computation)',
        callsRemaining: usage.remaining,
      })
    }

    if (action === 'interpret-field-photo') {
      const { imageBase64, mimeType, surveyTypeHint } = data || {}
      if (!imageBase64 || !mimeType) {
        return NextResponse.json({ error: 'imageBase64 and mimeType are required' }, { status: 400 })
      }
      const result = await interpretFieldPhoto({ imageBase64, mimeType, surveyTypeHint })
      return NextResponse.json({
        ...result,
        _safety: 'AI_FIELD_DATA_MUST_BE_VERIFIED',
        callsRemaining: usage.remaining,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error: unknown) {
    // Never expose API keys or internal details in error responses
    const message = error instanceof Error ? error.message : 'AI service error'
    console.error('[ai/chat] Error:', message)

    // Map common NVIDIA errors to user-friendly messages
    if (message.includes('NVIDIA_API_KEY not configured')) {
      return NextResponse.json(
        { error: 'AI service is not configured. Please contact support.', code: 'AI_NOT_CONFIGURED' },
        { status: 503 }
      )
    }
    if (message.includes('429')) {
      return NextResponse.json(
        { error: 'AI service is busy. Please try again in a moment.', code: 'AI_OVERLOADED' },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: 'AI service error. Please try again.', code: 'AI_ERROR' },
      { status: 500 }
    )
  }
}

// ─── GET: Health check ────────────────────────────────────────────────────────

export async function GET() {
  const configured = isConfigured()
  return NextResponse.json({
    configured,
    models: configured ? ['meta/llama-3.1-70b-instruct', 'meta/llama-3.2-90b-vision-instruct'] : [],
  })
}
