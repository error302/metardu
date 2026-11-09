import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import WebSocket from 'ws'

export const collaborationCandidateTag = 'metardu-metardu-collaboration:candidate'
export const collaborationRollbackTag = 'metardu-metardu-collaboration:rollback-current'

export function collaborationConfiguration(appEnvironment, running, compose) {
  const origin = new URL(appEnvironment.NEXT_PUBLIC_APP_URL).origin
  assert.equal(origin, 'https://metardu.space', 'Review the production collaboration origin before changing it.')
  assert.equal(compose.COLLAB_ALLOWED_ORIGINS, origin)
  assert.ok(appEnvironment.AUTH_SECRET && running.AUTH_SECRET === appEnvironment.AUTH_SECRET, 'The ticket issuer and collaboration service must share the configured signing key.')
  for (const key of Object.keys(compose)) {
    if (key !== 'COLLAB_ALLOWED_ORIGINS') assert.equal(compose[key], running[key], 'Review collaboration runtime setting before changing it: '+key)
  }
  return {origin, protocolVersion:1}
}

export function buildCollaborationCandidate({revision,docker}) {
  assert.match(revision,/^[a-f0-9]{40}$/)
  const probe = spawnSync('docker',['image','inspect',collaborationCandidateTag],{encoding:'utf8',windowsHide:true,timeout:30000})
  if (probe.status===0) {
    const [image]=JSON.parse(probe.stdout)
    if (image.Config.Labels?.['org.opencontainers.image.revision']===revision) return image.Id
  }
  const archive=spawnSync('git',['-c','core.fsmonitor=false','archive','--format=tar',revision,'Dockerfile.collaboration','src/lib/realtime','tsconfig.json'],
    {windowsHide:true,timeout:30000,maxBuffer:4*1024*1024})
  assert.equal(archive.status,0,'Pinned collaboration build context could not be archived.')
  docker(['build','--builder','desktop-linux','-f','Dockerfile.collaboration','--tag',collaborationCandidateTag,
    '--label','org.opencontainers.image.revision='+revision,'-'],{input:archive.stdout,timeout:240000})
  const [image]=JSON.parse(docker(['image','inspect',collaborationCandidateTag]))
  assert.equal(image.Config.Labels['org.opencontainers.image.revision'],revision)
  return image.Id
}

export function checkRoomRoute(url, origin, { timeout = 7000, protocols = ['metardu-room-v1','ticket.invalid'] } = {}) {
  const target = new URL('/ws/collaboration',url)
  assert.ok(['ws:','wss:'].includes(target.protocol))
  target.searchParams.set('projectId',randomUUID())
  return new Promise((resolve,reject)=>{
    let opened=false, negotiated=false, unexpectedFrame=false
    const ws = new WebSocket(target,protocols,{origin,handshakeTimeout:timeout,followRedirects:false})
    const timer=setTimeout(()=>{
      ws.terminate()
      reject(new Error('Collaboration route did not finish its unauthenticated handshake within the time limit.'))
    },timeout)
    ws.once('open',()=>{opened=true;negotiated=ws.protocol==='metardu-room-v1'})
    ws.on('message',()=>{unexpectedFrame=true;ws.terminate()})
    ws.once('error',()=>{clearTimeout(timer);reject(new Error('Collaboration route could not negotiate the room protocol.'))})
    ws.once('close',code=>{
      clearTimeout(timer)
      if(!opened||!negotiated||code!==1008||unexpectedFrame) reject(new Error('Collaboration route did not reject invalid credentials before sending room data.'))
      else resolve({protocolVersion:1,invalidTicketDenied:true})
    })
  })
}
