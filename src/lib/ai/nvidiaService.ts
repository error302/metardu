/**
 * NVIDIA NIM API Service
 * Provides AI capabilities for survey data analysis, QA, and assistance
 */

import { env } from '@/lib/env'

const NVIDIA_API_KEY = env.NVIDIA_API_KEY
const BASE_URL = 'https://integrate.api.nvidia.com/v1'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
}

/**
 * Chat with NVIDIA NIM models
 */
export async function chat(options: ChatOptions): Promise<string> {
  const {
    messages,
    model = 'meta/llama-3.1-70b-instruct',
    temperature = 0.7,
    maxTokens = 1024,
  } = options

  if (!NVIDIA_API_KEY) {
    throw new Error('NVIDIA_API_KEY not configured')
  }

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`NVIDIA API error: ${response.status} ${error}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

/**
 * Survey Data QA - Check for errors and inconsistencies
 */
export async function checkSurveyDataQA(data: {
  coordinates?: Array<{ point: string; easting: number; northing: number; elevation?: number }>
  distances?: Array<{ from: string; to: string; distance: number; bearing?: string }>
  area?: number
  surveyType: string
}): Promise<string> {
  const prompt = `You are a professional land surveyor reviewing survey data for quality assurance.

Survey Type: ${data.surveyType}

${data.coordinates?.length ? `Coordinates:
${data.coordinates.map(c => `  ${c.point}: E:${c.easting}, N:${c.northing}${c.elevation ? `, Z:${c.elevation}` : ''}`).join('\n')}
` : ''}

${data.distances?.length ? `Distances:
${data.distances.map(d => `  ${d.from} to ${d.to}: ${d.distance}m${d.bearing ? ` @ ${d.bearing}` : ''}`).join('\n')}
` : ''}

${data.area ? `Calculated Area: ${data.area} hectares` : ''}

Please review this survey data and identify:
1. Any mathematical inconsistencies (closing errors, misclosures)
2. Outliers or suspicious values
3. Missing data or gaps
4. Compliance with standard survey accuracy requirements
5. Recommendations for improvement

Respond in a structured format with clear findings.`

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'You are an expert land surveyor with 20+ years experience in survey quality assurance,熟悉RDM, Survey Act, and international standards.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ]

  return await chat({ messages, model: 'meta/llama-3.1-70b-instruct' })
}

/**
 * Extract coordinates from text (e.g., field notes, PDF OCR output)
 */
export async function extractCoordinates(text: string): Promise<{
  coordinates: Array<{ point: string; easting: number; northing: number; elevation?: number }>
  warnings: string[]
}> {
  const prompt = `Extract all coordinate data from the following survey text. Return ONLY valid JSON in this exact format:

{
  "coordinates": [
    {"point": "POINT_ID", "easting": 12345.678, "northing": 98765.432, "elevation": 123.456}
  ],
  "warnings": ["Any issues or ambiguities found"]
}

Survey text:
${text}

If no valid coordinates found, return empty arrays.`

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'You are a precise data extraction assistant. Extract survey coordinates from text and return ONLY valid JSON.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ]

  const response = await chat({ messages, model: 'meta/llama-3.1-70b-instruct', temperature: 0.1 })
  
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? jsonMatch[0] : '{}'
    const parsed = JSON.parse(jsonStr)
    
    return {
      coordinates: parsed.coordinates || [],
      warnings: parsed.warnings || [],
    }
  } catch (e) {
    console.error('Failed to parse NVIDIA response:', e)
    return { coordinates: [], warnings: ['Failed to parse AI response'] }
  }
}

/**
 * Generate survey report section
 */
export async function generateReportSection(options: {
  sectionType: string
  surveyType: string
  projectData: Record<string, any>
  customInstructions?: string
}): Promise<string> {
  const { sectionType, surveyType, projectData, customInstructions } = options

  const prompt = `Generate a professional "${sectionType}" section for a ${surveyType} survey report.

Project Details:
${Object.entries(projectData).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

${customInstructions ? `Custom Instructions: ${customInstructions}` : ''}

Write in professional surveyor language, suitable for submission to regulatory authorities. Include relevant technical details and compliance statements.`

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'You are a professional land surveyor writing formal survey reports. Use precise technical language and reference relevant standards.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ]

  return await chat({ messages, model: 'meta/llama-3.1-70b-instruct' })
}

/**
 * Compare survey results against expected values
 */
export async function validateSurveyResults(options: {
  surveyType: string
  measured: Record<string, any>
  expected?: Record<string, any>
  tolerances?: Record<string, number>
}): Promise<{
  passed: boolean
  findings: string[]
  recommendations: string[]
}> {
  const { surveyType, measured, expected, tolerances } = options

  const prompt = `Validate the following survey results against expected values and tolerances.

Survey Type: ${surveyType}

Measured Values:
${Object.entries(measured).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

${expected ? `Expected Values:\n${Object.entries(expected).map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : ''}

${tolerances ? `Tolerances:\n${Object.entries(tolerances).map(([k, v]) => `- ${k}: ±${v}`).join('\n')}` : ''}

Return JSON:
{
  "passed": true/false,
  "findings": ["Finding 1", "Finding 2"],
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}`

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'You are a survey QA expert. Analyze survey results critically and provide actionable feedback.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ]

  const response = await chat({ 
    messages, 
    model: 'meta/llama-3.1-70b-instruct',
    temperature: 0.1,
  })
  
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? jsonMatch[0] : '{}'
    return JSON.parse(jsonStr)
  } catch (e) {
    console.error('Failed to parse validation response:', e)
    return {
      passed: false,
      findings: ['Failed to parse AI validation'],
      recommendations: ['Manual review required'],
    }
  }
}

export default {
  chat,
  checkSurveyDataQA,
  extractCoordinates,
  generateReportSection,
  validateSurveyResults,
}
