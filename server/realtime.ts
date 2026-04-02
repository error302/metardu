import { Server } from 'socket.io'
import { createServer } from 'http'

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
})

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  socket.on('subscribe', (data: { userId: string; projectId?: string }) => {
    if (data.projectId) {
      socket.join(`project:${data.projectId}`)
    }
    if (data.userId) {
      socket.join(`user:${data.userId}`)
    }
  })

  socket.on('unsubscribe', (data: { userId: string; projectId?: string }) => {
    if (data.projectId) {
      socket.leave(`project:${data.projectId}`)
    }
    if (data.userId) {
      socket.leave(`user:${data.userId}`)
    }
  })

  socket.on('update-fieldbook', (data: { projectId: string; fieldbookId: string; changes: unknown }) => {
    io.to(`project:${data.projectId}`).emit('fieldbook-updated', data)
  })

  socket.on('update-project', (data: { projectId: string; changes: unknown }) => {
    io.to(`project:${data.projectId}`).emit('project-updated', data)
  })

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)
  })
})

const PORT = process.env.WEBSOCKET_PORT || 8080
httpServer.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`)
})

export { io }