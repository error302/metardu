import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const version = lock.packages['node_modules/@napi-rs/canvas']?.version
assert.ok(version, 'The PDF canvas runtime must be locked')
assert.equal(manifest.dependencies?.['@napi-rs/canvas'], version, 'The PDF canvas runtime must be a required pinned dependency')
const canvas = require('@napi-rs/canvas')
assert.equal(require('@napi-rs/canvas/package.json').version, version)
for (const name of ['DOMMatrix', 'ImageData', 'Path2D']) assert.equal(typeof canvas[name], 'function', 'Missing native PDF constructor: ' + name)
const bitmap = canvas.createCanvas(2, 2), context = bitmap.getContext('2d')
const shape = new canvas.Path2D('M0 0H2V2H0Z')
context.fillStyle = '#ff0000'; context.fill(shape)
assert.deepEqual([...context.getImageData(0, 0, 1, 1).data], [255, 0, 0, 255])
assert.equal(new canvas.DOMMatrix().a, 1)
assert.equal(new canvas.ImageData(2, 2).data.length, 16)
const png = bitmap.toBuffer('image/png')
assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
assert.equal(png.readUInt32BE(16), 2); assert.equal(png.readUInt32BE(20), 2)
console.log('PASS PDF native canvas: real constructors, path drawing, observed pixels and PNG encoding')
