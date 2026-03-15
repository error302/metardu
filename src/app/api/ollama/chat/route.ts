import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { messages, model = 'llama3.1', stream: enableStream = true } = await request.json()

    const body = new URLSearchParams()
    body.append('model', model)
    body.append('messages', JSON.stringify(messages))
    body.append('stream', stream.toString())
    body.append('format', 'json')
    body.append('temperature', '0.7')

    const ollamaResponse = await fetch('https://ollama.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OLLAMA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages,
        stream: stream,
        temperature: 0.7,
      }),
    })

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama error: ${ollamaResponse.status}`)
    }

    const reader = ollamaResponse.body?.getReader()
    const responseStream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder()
        try {
          while (true) {
            const { done, value } = await reader!.read()
            if (done) break
            const chunk = decoder.decode(value)
            const lines = chunk.split('\n').filter(Boolean)
            for (const line of lines) {
              try {
                const data = JSON.parse(line)
                controller.enqueue(new TextEncoder().encode(JSON.stringify(data)))
              } catch {
                // Skip invalid JSON
              }
            }
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })

    return new Response(responseStream, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Ollama proxy error:', error)
    return NextResponse.json({ error: 'AI service unavailable. Ensure Ollama running on localhost:11434.' }, { status: 500 })
  }
}

