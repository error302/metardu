/* eslint-disable @typescript-eslint/no-require-imports -- Loaded directly by the Node child-process probe. */
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')

const filesToScan = [
  'src',
  'scripts',
  'public',
  'README.md',
  '.env.example',
  '.env.production.example',
  'docker-compose.yml',
  'docker-compose.secure.yml',
]

const historicalSchemaPaths = new Set([
  'src/lib/db/migrations',
  'scripts/init-test-db.sql',
])

function isTestOrSpecFile(relativePath) {
  return /\.(?:test|spec)\.[^.]+$/i.test(path.basename(relativePath))
}

function isHistoricalSchemaPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/')
  return historicalSchemaPaths.has(normalized)
    || normalized.startsWith('src/lib/db/migrations/')
}

function sourceFiles(relativePath) {
  if (isTestOrSpecFile(relativePath) || isHistoricalSchemaPath(relativePath)) return []

  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) return []
  if (fs.statSync(absolutePath).isFile()) return [relativePath]

  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap(entry => {
    const child = path.join(relativePath, entry.name)
    if (entry.isDirectory()) {
      if (
        isHistoricalSchemaPath(child) ||
        entry.name === '__tests__' ||
        isTestOrSpecFile(entry.name)
      ) {
        return []
      }
      return sourceFiles(child)
    }
    if (isTestOrSpecFile(child) || isHistoricalSchemaPath(child)) return []
    return child
  })
}

/**
 * @param {(contents: string) => boolean} pattern
 * @returns {string[]}
 */
function matchingFiles(pattern) {
  const matches = []
  for (const file of filesToScan.flatMap(sourceFiles)) {
    const contents = fs.readFileSync(path.join(root, file), 'utf8')
    if (pattern(`${file.replace(/\\/g, '/')}\n${contents}`)) {
      matches.push(file.replace(/\\/g, '/'))
    }
  }
  return matches
}

function readSourceFixtures() {
  return filesToScan.flatMap(sourceFiles).map(file => ({
    path: file,
    contents: fs.readFileSync(path.join(root, file), 'utf8'),
  }))
}

module.exports = {
  isHistoricalSchemaPath,
  isTestOrSpecFile,
  matchingFiles,
  readSourceFixtures,
  root,
  sourceFiles,
}
