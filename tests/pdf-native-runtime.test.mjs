import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
const checker = path.resolve('scripts/verify-pdf-native-runtime.mjs')
test('the actual installed PDF native runtime draws and encodes observed pixels', () => {
 const result = spawnSync(process.execPath, [checker], {encoding:'utf8', windowsHide:true, timeout:30000})
 assert.equal(result.status, 0, result.stderr)
 assert.match(result.stdout, /PASS PDF native canvas/)
})
test('a missing platform binding cannot pass the real preflight', () => {
 const fixture = mkdtempSync(path.join(tmpdir(), 'metardu-pdf-native-'))
 const loader = path.join(fixture, 'missing-binding.cjs')
 writeFileSync(loader, "const Module=require('node:module');const original=Module._load;Module._load=function(name,...rest){if(name==='@napi-rs/canvas')throw new Error('SYNTHETIC native binding unavailable');return original.call(this,name,...rest)}\n")
 const result = spawnSync(process.execPath, ['--require',loader,checker], {encoding:'utf8', windowsHide:true, timeout:30000})
 assert.notEqual(result.status, 0)
 assert.match(result.stderr, /SYNTHETIC native binding unavailable/)
 assert.doesNotMatch(result.stdout, /PASS PDF native canvas/)
})
