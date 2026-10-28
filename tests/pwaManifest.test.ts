/** @jest-environment node */
import fs from 'node:fs'
import path from 'node:path'
interface Icon { src: string; sizes: string; type?: string; purpose?: string }
const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/manifest.json'), 'utf8')) as {
  id: string; scope: string; start_url: string; display: string; short_name: string;
  icons: Icon[]; shortcuts: Array<{ url: string; icons: Icon[] }>;
  screenshots?: Icon[]; file_handlers?: unknown; protocol_handlers?: unknown; share_target?: unknown;
}
it('keeps a stable same-origin app identity and a standalone dashboard launch', () => {
  expect(manifest.id).toBe('/')
  expect(manifest.scope).toBe('/')
  expect(manifest.short_name).toBe('METARDU')
  expect(manifest.display).toBe('standalone')
  expect(new URL(manifest.start_url, 'https://metardu.space').pathname).toBe('/dashboard')
})
it('ships every declared PNG at its actual dimensions, including shortcuts and Apple touch icon', () => {
  expect(manifest.icons).toEqual(expect.arrayContaining([expect.objectContaining({ sizes: '192x192' }), expect.objectContaining({ sizes: '512x512' })]))
  for (const icon of [...manifest.icons, ...manifest.shortcuts.flatMap(shortcut => shortcut.icons), { src: '/apple-touch-icon.png', sizes: '180x180' }]) {
    expect(icon.src.startsWith('/')).toBe(true)
    const bytes = fs.readFileSync(path.join(process.cwd(), 'public', icon.src))
    expect(bytes.subarray(1, 4).toString()).toBe('PNG')
    expect(bytes.readUInt32BE(16) + 'x' + bytes.readUInt32BE(20)).toBe(icon.sizes)
  }
})
it('does not advertise missing screenshots or unimplemented OS file/deep-link delivery', () => {
  expect(manifest.screenshots).toBeUndefined()
  expect(manifest.file_handlers).toBeUndefined()
  expect(manifest.protocol_handlers).toBeUndefined()
  expect(manifest.share_target).toBeUndefined()
})
