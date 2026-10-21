import { spawnSync } from 'node:child_process'
import { verifyWorkerRuntime } from './worker-runtime-contract.mjs'

try {
  if (process.argv.length > 2) throw new Error('This command takes no arguments and only inspects the existing production worker.')
  const report = verifyWorkerRuntime({ docker(args, options = {}) {
    const result = spawnSync('docker', args, { ...options, encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 })
    if (result.error || result.status !== 0) throw new Error(`Docker ${args[0]} failed. Check Docker access; permission failure does not mean Docker is stopped.`)
    return result.stdout.trim()
  } })
  console.log(`Worker container: ${report.containerId}; image: ${report.imageId}`)
  console.log(`Artifact comparison: ${report.sourceRoot}`)
  if (report.failures.length) {
    for (const failure of report.failures) console.error(`FAIL: ${failure}`)
    process.exitCode = 1
  } else console.log('Worker artifact hashes, required task declarations, distribution metadata and RTKLIB executable presence passed.')
  console.log('This is read-only artifact evidence. Registered live routes, dependency imports, native computation, receiver and field accuracy require separate acceptance.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
