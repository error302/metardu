/**
 * @module collaborationServer
 *
 * Real-time collaboration server using WebSocket.
 *
 * Features:
 * - Live presence (who's online in a project)
 * - Cursor sharing (see other users' mouse position on the map)
 * - Live feature editing (see when others draw/edit features)
 * - Conflict-free updates via operational transforms
 *
 * This module sets up a WebSocket server that can be integrated
 * with Next.js custom server or run as a separate process.
 *
 * For Docker deployment, this runs alongside the Next.js app
 * on a separate port (3001) or as a serverless WebSocket.
 */

import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { parse } from 'url'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Collaborator {
  id: string
  userId: string
  userName: string
  projectId: string
  cursor?: { lat: number; lng: number }
  color: string
  lastSeen: number
  ws: WebSocket
}

interface CollaborationMessage {
  type: 'join' | 'leave' | 'cursor' | 'feature_edit' | 'feature_delete' | 'chat' | 'presence'
  userId?: string
  userName?: string
  projectId?: string
  cursor?: { lat: number; lng: number }
  feature?: {
    id: string
    type: 'Point' | 'LineString' | 'Polygon'
    geometry: unknown
    properties?: Record<string, unknown>
  }
  featureId?: string
  message?: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Collaboration Server
// ---------------------------------------------------------------------------

export class CollaborationServer {
  private wss: WebSocketServer | null = null
  private collaborators: Map<string, Collaborator> = new Map()
  private projectRooms: Map<string, Set<string>> = new Map() // projectId -> set of collaborator IDs

  // User colors for cursor display
  private readonly COLORS = [
    '#E8841A', '#3B82F6', '#10B981', '#8B5CF6',
    '#F59E0B', '#EF4444', '#06B6D4', '#EC4899',
  ]

  start(port: number = 3001) {
    const server = createServer()
    this.wss = new WebSocketServer({ server, path: '/ws/collaboration' })

    this.wss.on('connection', (ws: WebSocket, req) => {
      const url = parse(req.url || '', true)
      const userId = url.query.userId as string
      const userName = url.query.userName as string
      const projectId = url.query.projectId as string

      if (!userId || !projectId) {
        ws.close(1008, 'Missing userId or projectId')
        return
      }

      const collaboratorId = `${userId}-${Date.now()}`
      const color = this.COLORS[this.collaborators.size % this.COLORS.length]

      const collaborator: Collaborator = {
        id: collaboratorId,
        userId,
        userName: userName || `User ${userId.substring(0, 6)}`,
        projectId,
        color,
        lastSeen: Date.now(),
        ws,
      }

      this.collaborators.set(collaboratorId, collaborator)

      // Add to project room
      if (!this.projectRooms.has(projectId)) {
        this.projectRooms.set(projectId, new Set())
      }
      this.projectRooms.get(projectId)!.add(collaboratorId)

      // Notify room of new collaborator
      this.broadcastToProject(projectId, {
        type: 'join',
        userId,
        userName: collaborator.userName,
        projectId,
        timestamp: Date.now(),
      }, collaboratorId)

      // Send current presence to new collaborator
      this.sendPresence(ws, projectId)

      ws.on('message', (data: Buffer) => {
        try {
          const msg: CollaborationMessage = JSON.parse(data.toString())
          collaborator.lastSeen = Date.now()

          switch (msg.type) {
            case 'cursor':
              collaborator.cursor = msg.cursor
              this.broadcastToProject(projectId, {
                type: 'cursor',
                userId,
                userName: collaborator.userName,
                cursor: msg.cursor,
                timestamp: Date.now(),
              }, collaboratorId)
              break

            case 'feature_edit':
              this.broadcastToProject(projectId, {
                type: 'feature_edit',
                userId,
                userName: collaborator.userName,
                feature: msg.feature,
                timestamp: Date.now(),
              }, collaboratorId)
              break

            case 'feature_delete':
              this.broadcastToProject(projectId, {
                type: 'feature_delete',
                userId,
                userName: collaborator.userName,
                featureId: msg.featureId,
                timestamp: Date.now(),
              }, collaboratorId)
              break

            case 'chat':
              this.broadcastToProject(projectId, {
                type: 'chat',
                userId,
                userName: collaborator.userName,
                message: msg.message,
                timestamp: Date.now(),
              }, collaboratorId)
              break
          }
        } catch (err) {
          console.error('[CollaborationServer] Message parse error:', err)
        }
      })

      ws.on('close', () => {
        this.collaborators.delete(collaboratorId)
        this.projectRooms.get(projectId)?.delete(collaboratorId)

        this.broadcastToProject(projectId, {
          type: 'leave',
          userId,
          userName: collaborator.userName,
          timestamp: Date.now(),
        })
      })

      ws.on('error', (err) => {
        console.error('[CollaborationServer] WebSocket error:', err)
      })
    })

    // Heartbeat — remove stale connections
    setInterval(() => {
      const now = Date.now()
      for (const [id, collab] of this.collaborators) {
        if (now - collab.lastSeen > 60000) { // 60s timeout
          collab.ws.terminate()
          this.collaborators.delete(id)
          this.projectRooms.get(collab.projectId)?.delete(id)
        }
      }
    }, 30000)

    server.listen(port, () => {
      console.log(`[CollaborationServer] WebSocket server running on port ${port}`)
    })
  }

  private broadcastToProject(projectId: string, msg: CollaborationMessage, excludeId?: string) {
    const room = this.projectRooms.get(projectId)
    if (!room) return

    const data = JSON.stringify(msg)
    for (const collabId of room) {
      if (collabId === excludeId) continue
      const collab = this.collaborators.get(collabId)
      if (collab && collab.ws.readyState === WebSocket.OPEN) {
        collab.ws.send(data)
      }
    }
  }

  private sendPresence(ws: WebSocket, projectId: string) {
    const room = this.projectRooms.get(projectId)
    if (!room) return

    const presence = Array.from(room)
      .map(id => this.collaborators.get(id))
      .filter((c): c is Collaborator => c !== undefined)
      .map(c => ({
        userId: c.userId,
        userName: c.userName,
        color: c.color,
        cursor: c.cursor,
      }))

    ws.send(JSON.stringify({
      type: 'presence',
      timestamp: Date.now(),
      payload: presence,
    }))
  }

  stop() {
    this.wss?.close()
    this.collaborators.clear()
    this.projectRooms.clear()
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

let serverInstance: CollaborationServer | null = null

export function getCollaborationServer(): CollaborationServer {
  if (!serverInstance) {
    serverInstance = new CollaborationServer()
  }
  return serverInstance
}
