/**
 * @module collabEntry
 *
 * Standalone entry point for the collaboration WebSocket server.
 *
 * This file is what the `metardu-collaboration` Docker container runs:
 *     CMD ["node", "collabEntry.js"]
 *
 * The Next.js app imports the small ticket module and the browser hook,
 * not this entry point or its WebSocket runtime. Keeping the bootstrap
 * in its own file means the library
 * stays free of side-effects and we don't need `require.main === module`
 * gymnastics that confuse the Next.js bundler.
 */
/* eslint-disable no-console */

import { getCollaborationServer } from './collaborationServer'

const port = Number(process.env.PORT || 3001)
const server = getCollaborationServer()

void server.start(port).then(() => {
  console.log(`[collaboration] WebSocket server listening on :${port}/ws/collaboration`)
}).catch(() => {
  console.error('[collaboration] Could not start room listener')
  process.exitCode = 1
})

// Graceful shutdown so Docker can recycle the container cleanly.
process.on('SIGTERM', () => {
  void server.stop().finally(() => process.exit(0))
})
process.on('SIGINT', () => {
  void server.stop().finally(() => process.exit(0))
})
