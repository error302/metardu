import { createClient } from '@/lib/supabase/server'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type { ExtractedBuildingData, ParsedInputType, ExtractedRoom, ExtractedWall, ExtractedFloor, BoundingBox2D } from './types'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

interface ClaudeMessage {
  type: string
  text?: string
  id?: string
  stop_reason?: string
}

interface RoomDetection {
  name: string
  area: number
  function: string
}

interface WallDetection {
  startEasting: number
  startNorthing: number
  endEasting: number
  endNorthing: number
  type: string
}

interface AIDetectionResult {
  rooms: RoomDetection[]
  walls: WallDetection[]
  confidence: number
  warnings: string[]
}

async function callClaudeVision(
  imageBase64: string,
  prompt: string
): Promise<AIDetectionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Claude API error: ${error}`)
  }

  const data = await response.json()
  const content = data.content as ClaudeMessage[]
  
  if (!content || content.length === 0) {
    throw new Error('No response from Claude')
  }

  const textContent = content.find((c) => c.type === 'text')
  if (!textContent?.text) {
    throw new Error('No text in Claude response')
  }

  try {
    const result = JSON.parse(textContent.text)
    return {
      rooms: result.rooms || [],
      walls: result.walls || [],
      confidence: result.confidence || 0.5,
      warnings: result.warnings || [],
    }
  } catch {
    throw new Error('Failed to parse Claude response as JSON')
  }
}

export async function enhanceWithAI(
  data: ExtractedBuildingData,
  format: ParsedInputType,
  imageData?: string
): Promise<ExtractedBuildingData> {
  const warnings: string[] = []

  if (format === 'IMAGE' && imageData) {
    const prompt = `You are a survey and CAD expert. Analyze this building floor plan image and extract:
1. Rooms - with name, approximate area (in square meters), and function (living, bedroom, kitchen, bathroom, etc.)
2. Walls - with start/end coordinates (in meters), and wall type if identifiable

Return ONLY a JSON object with this exact structure:
{
  "rooms": [{"name": "Living Room", "area": 25.5, "function": "living"}, ...],
  "walls": [{"startEasting": 0, "startNorthing": 0, "endEasting": 10, "endNorthing": 0, "type": "external"}, ...],
  "confidence": 0.8,
  "warnings": ["any warnings"]
}

If you cannot determine something, use reasonable defaults. Do not include any other text or explanation.`

    try {
      const result = await callClaudeVision(imageData, prompt)

      if (result.rooms.length > 0) {
        data.rooms = result.rooms.map((r, i) => ({
          id: `room_ai_${i}`,
          name: r.name,
          floor: 0,
          boundary: generateRoomBoundary(r.area),
          area: r.area,
          perimeter: Math.sqrt(r.area) * 4,
          height: 3.0,
          function: r.function,
        }))
      }

      if (result.walls.length > 0) {
        data.walls = result.walls.map((w, i) => ({
          id: `wall_ai_${i}`,
          type: w.type as any,
          startPoint: { easting: w.startEasting, northing: w.startNorthing },
          endPoint: { easting: w.endEasting, northing: w.endNorthing },
          thickness: 0.2,
          height: 3.0,
          level: 0,
        }))
      }

      warnings.push(...result.warnings)
    } catch (error) {
      warnings.push(`AI enhancement failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  if (!data.rooms.length) {
    const defaultRooms = generateDefaultRooms(data.boundingBox)
    data.rooms = defaultRooms
    warnings.push('No rooms detected, generated default room outline')
  }

  for (const room of data.rooms) {
    if (!room.function) {
      room.function = inferRoomFunction(room.name)
    }
  }

  const confidenceBonus = 0.15
  data.metadata = {
    ...data.metadata,
    projectName: data.metadata.projectName || 'AI Enhanced Project',
  }

  if (warnings.length > 0) {
    warnings.forEach((w) => console.warn(`AI Enhancement: ${w}`))
  }

  return data
}

function generateRoomBoundary(area: number): { easting: number; northing: number }[] {
  const side = Math.sqrt(area)
  return [
    { easting: 0, northing: 0 },
    { easting: side, northing: 0 },
    { easting: side, northing: side },
    { easting: 0, northing: side },
  ]
}

function generateDefaultRooms(boundingBox: BoundingBox2D): ExtractedRoom[] {
  const width = boundingBox.maxEasting - boundingBox.minEasting
  const height = boundingBox.maxNorthing - boundingBox.minNorthing
  const area = width * height

  if (area > 200) {
    return [
      {
        id: 'room_living',
        name: 'Living Room',
        floor: 0,
        boundary: [
          { easting: boundingBox.minEasting, northing: boundingBox.minNorthing },
          { easting: boundingBox.minEasting + width * 0.6, northing: boundingBox.minNorthing },
          { easting: boundingBox.minEasting + width * 0.6, northing: boundingBox.maxNorthing },
          { easting: boundingBox.minEasting, northing: boundingBox.maxNorthing },
        ],
        area: area * 0.6,
        perimeter: 2 * (width * 0.6 + height),
        height: 3.0,
        function: 'living',
      },
      {
        id: 'room_bedroom',
        name: 'Bedroom',
        floor: 0,
        boundary: [
          { easting: boundingBox.minEasting + width * 0.6, northing: boundingBox.minNorthing },
          { easting: boundingBox.maxEasting, northing: boundingBox.minNorthing },
          { easting: boundingBox.maxEasting, northing: boundingBox.maxNorthing },
          { easting: boundingBox.minEasting + width * 0.6, northing: boundingBox.maxNorthing },
        ],
        area: area * 0.4,
        perimeter: 2 * (width * 0.4 + height),
        height: 3.0,
        function: 'bedroom',
      },
    ]
  }

  return [
    {
      id: 'room_main',
      name: 'Main Area',
      floor: 0,
      boundary: [
        { easting: boundingBox.minEasting, northing: boundingBox.minNorthing },
        { easting: boundingBox.maxEasting, northing: boundingBox.minNorthing },
        { easting: boundingBox.maxEasting, northing: boundingBox.maxNorthing },
        { easting: boundingBox.minEasting, northing: boundingBox.maxNorthing },
      ],
      area,
      perimeter: 2 * (width + height),
      height: 3.0,
    },
  ]
}

function inferRoomFunction(roomName: string): string {
  const name = roomName.toLowerCase()
  
  if (name.includes('living') || name.includes('lounge') || name.includes('sitting')) return 'living'
  if (name.includes('bed') || name.includes('bedroom') || name.includes('sleep')) return 'bedroom'
  if (name.includes('kitchen') || name.includes('cook')) return 'kitchen'
  if (name.includes('bath') || name.includes('toilet') || name.includes('wash')) return 'bathroom'
  if (name.includes('dining') || name.includes('eat')) return 'dining'
  if (name.includes('study') || name.includes('office') || name.includes('work')) return 'study'
  if (name.includes('garage') || name.includes('parking')) return 'garage'
  if (name.includes('store') || name.includes('utility')) return 'storage'
  
  return 'unknown'
}

export async function analyzeImageWithAI(imageBlob: Blob): Promise<AIDetectionResult> {
  const arrayBuffer = await imageBlob.arrayBuffer()
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  )

  const prompt = `You are a survey expert. Analyze this building floor plan image and extract rooms and walls.

Return ONLY valid JSON with this exact structure:
{
  "rooms": [{"name": "Living Room", "area": 25.5, "function": "living"}, ...],
  "walls": [{"startEasting": 0, "startNorthing": 0, "endEasting": 10, "endNorthing": 0, "type": "external"}, ...],
  "confidence": 0.8,
  "warnings": []
}`

  return callClaudeVision(base64, prompt)
}