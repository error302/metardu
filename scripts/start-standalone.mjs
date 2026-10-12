import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'
import nextEnv from '@next/env'
import { standalonePaths, assertNoBundledEnvironmentFiles } from './standalone-paths.mjs'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
process.env.NODE_ENV='production'
nextEnv.loadEnvConfig(root,false)
const {standalone}=standalonePaths(root,process.env.METARDU_NEXT_DIST_DIR||'.next')
assertNoBundledEnvironmentFiles(standalone)
const server=path.join(standalone,'server.js')
if(!existsSync(server))throw new Error('Standalone server is missing. Run the production build before starting.')
await import(pathToFileURL(server).href)
