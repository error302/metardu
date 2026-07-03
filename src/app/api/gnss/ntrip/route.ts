/**
 * GET /api/gnss/ntrip?host=X&port=Y&mountpoint=Z&user=W&pass=P
 *
 * Server-Sent Events endpoint that connects to an NTRIP caster via TCP
 * and streams RTCM3 correction messages to the browser.
 *
 * AUDIT FIX (2026-07-03): Browsers can't do raw TCP (NTRIP protocol),
 * so this server-side proxy bridges the gap. It connects to the NTRIP
 * caster using Node's `net` module, parses RTCM3 messages, and forwards
 * them as SSE events.
 *
 * The browser receives:
 *   - `status` events: connection status, message count, errors
 *   - `rtcm` events: parsed RTCM3 message type + timestamp
 *
 * For actual correction data forwarding to a GNSS receiver, the browser
 * would use the Web Serial API or Web Bluetooth API to send the raw
 * RTCM bytes to the receiver over a serial/Bluetooth connection.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300  // 5 minutes max per connection

import { NextRequest } from 'next/server'
import { parseRTCM3Message, type NTRIPConfig } from '@/lib/gnss/ntripClient'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const host = searchParams.get('host')
  const port = parseInt(searchParams.get('port') || '2101', 10)
  const mountpoint = searchParams.get('mountpoint') || ''
  const username = searchParams.get('user') || undefined
  const password = searchParams.get('pass') || undefined

  if (!host || !mountpoint) {
    return new Response(JSON.stringify({ error: 'host and mountpoint are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const config: NTRIPConfig = { host, port, mountpoint, username, password }

  // Use Server-Sent Events
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      send('status', { connected: false, message: `Connecting to ${host}:${port}/${mountpoint}...` })

      try {
        // Dynamic import net (Node.js only)
        const { createConnection } = await import('net')

        const socket = createConnection({ host, port }, () => {
          // Send NTRIP HTTP request
          const auth = username
            ? `Authorization: Basic ${Buffer.from(`${username}:${password || ''}`).toString('base64')}\r\n`
            : ''

          const req =
            `GET /${mountpoint} HTTP/1.1\r\n` +
            `Host: ${host}:${port}\r\n` +
            auth +
            `User-Agent: METARDU/1.0\r\n` +
            `Ntrip-Version: Ntrip/2.0\r\n` +
            `Accept: rtk/rtcm, ./\r\n` +
            `\r\n`

          socket.write(req)
        })

        let buffer = Buffer.alloc(0)
        let headerParsed = false
        let messageCount = 0
        let lastMessageAt: string | null = null

        socket.on('data', (data: Buffer) => {
          buffer = Buffer.concat([buffer, data])

          // First, check for HTTP response header
          if (!headerParsed) {
            const headerEnd = buffer.indexOf('\r\n\r\n')
            if (headerEnd === -1) return

            const header = buffer.slice(0, headerEnd).toString('ascii')
            buffer = buffer.slice(headerEnd + 4)
            headerParsed = true

            if (header.includes('200 OK') || header.includes('200 ok') || header.includes('ICY 200 OK')) {
              send('status', { connected: true, message: 'Connected to NTRIP caster' })
            } else {
              const errLine = header.split('\r\n')[0] || 'Unknown error'
              send('status', { connected: false, error: `NTRIP caster rejected: ${errLine}` })
              socket.destroy()
              controller.close()
              return
            }
          }

          // Parse RTCM3 messages from the buffer
          let offset = 0
          while (offset < buffer.length) {
            // Look for RTCM3 preamble (0xD3)
            if (buffer[offset] !== 0xD3) {
              offset++
              continue
            }

            const msg = parseRTCM3Message(buffer, offset)
            if (!msg) break

            messageCount++
            lastMessageAt = new Date().toISOString()

            // Send parsed message info (not the raw bytes — too large for SSE)
            send('rtcm', {
              type: msg.type,
              length: msg.length,
              receivedAt: msg.receivedAt,
              messageCount,
              lastMessageAt,
            })

            offset += 3 + msg.length + 3  // preamble + length + body + CRC
          }

          // Trim processed data from buffer
          if (offset > 0) {
            buffer = buffer.slice(offset)
          }

          // Prevent buffer from growing unboundedly
          if (buffer.length > 65536) {
            buffer = buffer.slice(-4096)  // keep last 4KB
          }
        })

        socket.on('error', (err: Error) => {
          send('status', { connected: false, error: `Connection error: ${err.message}` })
          controller.close()
        })

        socket.on('close', () => {
          send('status', { connected: false, message: 'Connection closed' })
          controller.close()
        })

        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          socket.destroy()
          controller.close()
        })

      } catch (err) {
        send('status', {
          connected: false,
          error: `Failed to create connection: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}
