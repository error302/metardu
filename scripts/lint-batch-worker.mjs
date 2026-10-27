import { createRequire } from 'node:module'
import { eslintOptions } from './lint-batches.mjs'

const require = createRequire(import.meta.url)
process.once('message', async ({ files, cwd }) => {
  try {
    const { ESLint } = require('eslint')
    const results = await new ESLint(eslintOptions(cwd)).lintFiles(files)
    process.send({ results, maxRssKb: process.resourceUsage().maxRSS }, error => {
      if (error) process.exitCode = 1
      process.disconnect()
    })
  } catch (error) {
    console.error(error)
    process.exitCode = 1
    process.disconnect()
  }
})
