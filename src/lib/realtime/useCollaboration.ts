'use client'

/**
 * useCollaboration — Client-side hook for real-time collaboration
 *
 * Features:
 * - Connect to WebSocket collaboration server
 * - Track online collaborators in a project
 - Share cursor position with other users
 * - Receive live feature edits from other users
 * - Send chat messages
 *
 * Usage:
 * const { collaborators, sendCursor, isConnected } = useCollaboration({
 *   projectId: '123',
 *   userName: 'John Doe'
 * })
 */

import { useState, useEffect, useCallback, useRef } from 'react'

export interface Collaborator {
  userId: string
  userName: string
  color: string
  cursor?: { lat: number; lng: number }
}

interface UseCollaborationProps {
  projectId: string | null
  userId?: string
  userName?: string
  /** WebSocket URL — defaults to same host on port 3001 */
  wsUrl?: string
}

interface UseCollaborationReturn {
  collaborators: Collaborator[]
  isConnected: boolean
  sendCursor: (lat: number, lng: number) => void
  sendFeatureEdit: (feature: any) => void
  sendFeatureDelete: (featureId: string) => void
  sendChat: (message: string) => void
  onFeatureEdit?: (feature: any, userId: string) => void
  onFeatureDelete?: (featureId: string, userId: string) => void
  onChat?: (message: string, userName: string, userId: string) => void
}

export function useCollaboration({
  projectId,
  userId,
  userName,
  wsUrl,
}: UseCollaborationProps): UseCollaborationReturn {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const callbacksRef = useRef<{
    onFeatureEdit?: (feature: any, userId: string) => void
    onFeatureDelete?: (featureId: string, userId: string) => void
    onChat?: (message: string, userName: string, userId: string) => void
  }>({})

  // Determine WebSocket URL
  const finalWsUrl = wsUrl || (
    typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:3001/ws/collaboration`
      : ''
  )

  // Connect to WebSocket
  useEffect(() => {
    if (!projectId || !userId || !finalWsUrl) return

    const url = `${finalWsUrl}?userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName || '')}&projectId=${encodeURIComponent(projectId)}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        switch (msg.type) {
          case 'presence':
            if (Array.isArray(msg.payload)) {
              setCollaborators(msg.payload.filter((c: Collaborator) => c.userId !== userId))
            }
            break

          case 'join':
            setCollaborators(prev => {
              if (prev.some(c => c.userId === msg.userId)) return prev
              return [...prev, {
                userId: msg.userId,
                userName: msg.userName || 'Unknown',
                color: '#3B82F6',
              }]
            })
            break

          case 'leave':
            setCollaborators(prev => prev.filter(c => c.userId !== msg.userId))
            break

          case 'cursor':
            setCollaborators(prev =>
              prev.map(c =>
                c.userId === msg.userId
                  ? { ...c, cursor: msg.cursor, userName: msg.userName || c.userName }
                  : c
              )
            )
            break

          case 'feature_edit':
            callbacksRef.current.onFeatureEdit?.(msg.feature, msg.userId)
            break

          case 'feature_delete':
            callbacksRef.current.onFeatureDelete?.(msg.featureId, msg.userId)
            break

          case 'chat':
            callbacksRef.current.onChat?.(msg.message, msg.userName, msg.userId)
            break
        }
      } catch (err) {
        console.error('[useCollaboration] Message parse error:', err)
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      setCollaborators([])
    }

    ws.onerror = (err) => {
      console.error('[useCollaboration] WebSocket error:', err)
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [projectId, userId, userName, finalWsUrl])

  // Send functions
  const sendCursor = useCallback((lat: number, lng: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'cursor',
        cursor: { lat, lng },
        timestamp: Date.now(),
      }))
    }
  }, [])

  const sendFeatureEdit = useCallback((feature: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'feature_edit',
        feature,
        timestamp: Date.now(),
      }))
    }
  }, [])

  const sendFeatureDelete = useCallback((featureId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'feature_delete',
        featureId,
        timestamp: Date.now(),
      }))
    }
  }, [])

  const sendChat = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'chat',
        message,
        timestamp: Date.now(),
      }))
    }
  }, [])

  return {
    collaborators,
    isConnected,
    sendCursor,
    sendFeatureEdit,
    sendFeatureDelete,
    sendChat,
    ...callbacksRef.current,
  }
}
