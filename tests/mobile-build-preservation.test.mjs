import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'

// Copy only the build helper into an owned filesystem fixture. The Next build
// command is substituted; these checks prove preservation, not mobile export.
const fixtureParent = path.resolve('.cache/mobile-stash-tests')
fs.mkdirSync(fixtureParent, { recursive: true })
function fixture(t, mode) {
  const token = randomUUID()
  const root = fs.mkdtempSync(path.join(fixtureParent, 'owned-'))
  fs.writeFileSync(path.join(root, 'owner.txt'), token)
  const write = (relative, contents) => {
    const target = path.join(root, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, contents)
  }
  write('scripts/mobile-build.mjs', fs.readFileSync('scripts/mobile-build.mjs'))
  write('src/app/api/original.txt', 'original API source')
  write('src/app/auth/callback/route.ts', 'original callback source')
  write('src/app/.well-known/oauth-authorization-server/route.ts', 'remote authorization metadata')
  write('src/app/p/[id]/page.tsx', 'remote shared draft route')
  write('build.cjs', `const fs=require('node:fs'); fs.writeFileSync('build-ran.txt','yes');
    const mode=${JSON.stringify(mode)};
    if(mode==='conflict'){fs.mkdirSync('src/app/api',{recursive:true});fs.writeFileSync('src/app/api/concurrent.txt','concurrent source');}
    if(mode==='success'&&(fs.existsSync('src/app/.well-known')||fs.existsSync('src/app/p/[id]')))throw Error('remote web routes included in mobile build');
    if(mode==='failure'||mode==='conflict')process.exitCode=9;
  `)
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`
  write('bin/npx', `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(root, 'build.cjs'))}\n`)
  fs.chmodSync(path.join(root, 'bin/npx'), 0o755)
  write('bin/npx.cmd', `@echo off\r\n"${process.execPath}" "${path.join(root, 'build.cjs')}"\r\nexit /b %errorlevel%\r\n`)
  const env = { ...process.env }
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH'
  env[pathKey] = path.join(root, 'bin') + path.delimiter + env[pathKey]
  t.after(() => {
    // Exact owned fixture only; never follow a path outside this test parent.
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(fixtureParent))
    assert.equal(fs.readFileSync(path.join(root, 'owner.txt'), 'utf8'), token)
    fs.rmSync(root, { recursive: true })
  })
  return { root, write, read: relative => fs.readFileSync(path.join(root, relative), 'utf8'),
    exists: relative => fs.existsSync(path.join(root, relative)),
    run: () => spawnSync(process.execPath, [path.join(root, 'scripts/mobile-build.mjs')], { cwd: root, env, windowsHide: true, encoding: 'utf8', timeout: 15000 }),
  }
}

test('a previous interrupted stash is preserved and blocks a new build before any move', t => {
  const f = fixture(t, 'success')
  f.write('src/.stash-mobile-build/api/retained.txt', 'retained interrupted source')
  const result = f.run()
  assert.notEqual(result.status, 0)
  assert.equal(f.read('src/.stash-mobile-build/api/retained.txt'), 'retained interrupted source')
  assert.equal(f.read('src/app/api/original.txt'), 'original API source')
  assert.equal(f.exists('build-ran.txt'), false)
})

test('a failed build restores every moved source subtree', t => {
  const f = fixture(t, 'failure')
  assert.notEqual(f.run().status, 0)
  assert.equal(f.read('src/app/api/original.txt'), 'original API source')
  assert.equal(f.read('src/app/auth/callback/route.ts'), 'original callback source')
  assert.equal(f.exists('src/.stash-mobile-build'), false)
})

test('a concurrent replacement and the original stash both survive restoration conflict', t => {
  const f = fixture(t, 'conflict')
  assert.notEqual(f.run().status, 0)
  assert.equal(f.read('src/app/api/concurrent.txt'), 'concurrent source')
  assert.equal(f.read('src/.stash-mobile-build/api/original.txt'), 'original API source')
  assert.equal(f.read('src/app/auth/callback/route.ts'), 'original callback source')
})

test('successful packaging excludes remote metadata and restores the exact original sources', t => {
  const f = fixture(t, 'success')
  const result = f.run()
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(f.read('src/app/api/original.txt'), 'original API source')
  assert.equal(f.read('src/app/.well-known/oauth-authorization-server/route.ts'), 'remote authorization metadata')
  assert.equal(f.read('src/app/p/[id]/page.tsx'), 'remote shared draft route')
  assert.equal(f.exists('src/.stash-mobile-build'), false)
})
