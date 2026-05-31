import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, lstatSync } from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const standaloneDir = path.join(rootDir, '.next', 'standalone')

if (!existsSync(standaloneDir)) {
  console.log('[prepare-standalone] standalone output missing, skipping asset copy')
  process.exit(0)
}

const staticSource = path.join(rootDir, '.next', 'static')
const staticTarget = path.join(standaloneDir, '.next', 'static')

if (existsSync(staticSource)) {
  mkdirSync(path.dirname(staticTarget), { recursive: true })
  rmSync(staticTarget, { recursive: true, force: true })
  cpSync(staticSource, staticTarget, { recursive: true })
  console.log('[prepare-standalone] copied .next/static into standalone output')
} else {
  console.warn('[prepare-standalone] .next/static not found, skipping asset copy')
}

const publicSource = path.join(rootDir, 'public')
const publicTarget = path.join(standaloneDir, 'public')

if (existsSync(publicSource)) {
  if (existsSync(publicTarget)) {
    rmSync(publicTarget, { recursive: true, force: true })
  }
  cpSync(publicSource, publicTarget, { recursive: true })
  console.log('[prepare-standalone] copied public into standalone output')
}

// Copy .env.local into standalone so PM2 picks it up
const envLocalSource = path.join(rootDir, '.env.local')
const envLocalTarget = path.join(standaloneDir, '.env.local')
if (existsSync(envLocalSource)) {
  cpSync(envLocalSource, envLocalTarget)
  console.log('[prepare-standalone] copied .env.local into standalone output')
}

// Symlink node_modules for native modules (canvas, etc.) required at runtime
const nmSource = path.join(rootDir, 'node_modules')
const nmTarget = path.join(standaloneDir, 'node_modules')
try {
  if (!existsSync(nmTarget)) {
    symlinkSync(nmSource, nmTarget, 'junction')
    console.log('[prepare-standalone] symlinked node_modules into standalone output')
  } else {
    // Verify existing is a symlink
    const stat = lstatSync(nmTarget)
    if (!stat.isSymbolicLink()) {
      console.warn('[prepare-standalone] node_modules exists but is not a symlink — native modules like canvas may fail')
    }
  }
} catch (e) {
  console.warn('[prepare-standalone] could not symlink node_modules:', e.message)
}
