import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
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

if (existsSync(publicSource) && !existsSync(publicTarget)) {
  cpSync(publicSource, publicTarget, { recursive: true })
  console.log('[prepare-standalone] copied public into standalone output')
}
