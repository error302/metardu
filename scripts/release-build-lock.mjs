import {openSync,closeSync,writeFileSync,readFileSync,unlinkSync} from 'node:fs'
import {randomUUID} from 'node:crypto'

// A stale lock blocks admission. Never remove another process's lock automatically.
export async function withExclusiveCandidateBuild(lockPath,work) {
  const token=randomUUID()
  const descriptor=openSync(lockPath,'wx',0o600)
  try {
    writeFileSync(descriptor,JSON.stringify({pid:process.pid,token,startedAt:new Date().toISOString()}))
    return await work()
  } finally {
    closeSync(descriptor)
    const current=JSON.parse(readFileSync(lockPath,'utf8'))
    if(current.token!==token)throw new Error('Candidate build lock ownership changed; inspect before cleanup.')
    unlinkSync(lockPath)
  }
}
