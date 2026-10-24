// Static route/link inventory. A matching page is not runtime or visual proof.
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

function walk(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(root, entry.name)) : [path.join(root, entry.name)])
}
const normalize = file => file.replaceAll('\\', '/')
const pages = walk('src/app').filter(file => /[/\\]page\.tsx$/.test(file))
const routes = pages.map(file => {
  const segments = normalize(path.relative('src/app', path.dirname(file))).split('/').filter(part => part && !part.startsWith('(') && !part.startsWith('@'))
  const pattern = segments.map(part => /^\[\[\.\.\./.test(part) ? '.*' : /^\[\.\.\./.test(part) ? '.+' : /^\[/.test(part) ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/')
  return { file: normalize(file), route: '/' + segments.join('/'), matches: new RegExp(`^/${pattern}/?$`) }
})
const sources = walk('src').filter(file => /\.tsx?$/.test(file) && !/\.test\.|\.d\.ts$|[/\\]__tests__[/\\]/.test(file))
const links = []
for (const file of sources) {
  const text = readFileSync(file, 'utf8'), source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  function visit(node) {
    let value
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'href' && node.initializer) {
      const initial = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer
      if (initial && ts.isStringLiteralLike(initial)) value = initial.text
    } else if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'href' && ts.isStringLiteralLike(node.initializer)) value = node.initializer.text
    if (value?.startsWith('/') && !value.startsWith('//') && !value.startsWith('/api/')) {
      const route = value.split(/[?#]/)[0] || '/'
      const assetPath = path.resolve('public', '.' + route), relativeAsset = path.relative(path.resolve('public'), assetPath)
      const asset = !relativeAsset.startsWith('..') && !path.isAbsolute(relativeAsset) && existsSync(assetPath) ? normalize(assetPath) : null
      links.push({ file: normalize(file), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, href: value, route, page: routes.find(item => item.matches.test(route))?.file ?? null, asset })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}
const missing = links.filter(link => !link.page && !link.asset)
const report = { checkedAt: new Date().toISOString(), scope: 'static local hrefs and App Router page files only; no runtime, access, data or layout proof', pages: routes.map(({ file, route }) => ({ file, route })), links, missing }
mkdirSync('.cache/workspace-ui', { recursive: true })
writeFileSync('.cache/workspace-ui/navigation-routes.json', JSON.stringify(report, null, 2) + '\n')
console.log(`${pages.length} page files, ${links.length} static page links, ${missing.length} unmatched references`)
for (const [href, items] of Map.groupBy(missing, item => item.route)) console.log(`${href}: ${items.map(item => `${item.file}:${item.line}`).join(', ')}`)
process.exitCode = missing.length ? 1 : 0
