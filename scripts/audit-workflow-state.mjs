import ts from 'typescript'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const roots = ['src/app', 'src/components', 'src/hooks', 'src/lib', 'src/stores']
const phase = /loading|pending|busy|saving|exporting|generating|submitting|syncing|uploading|connecting|ready|error|failed|status|step|phase|stage|dirty|mode|running|active|progress|complete|retry/i
const rows = []
let scanned = 0
function visitDir(dir) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch (error) {
    if (error.code === 'ENOENT' && roots.includes(dir)) return
    throw error
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) { visitDir(path); continue }
    if (!/\.tsx?$/.test(path) || /\.d\.ts$/.test(path)) continue
    scanned++
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
    const owners = new Map()
    function owner(node) {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isFunctionDeclaration(parent) || ts.isMethodDeclaration(parent)) return parent.name?.getText(source) ?? '(anonymous)'
        if ((ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) && ts.isVariableDeclaration(parent.parent)) return parent.parent.name.getText(source)
      }
      return '(module)'
    }
    function walk(node) {
      if (ts.isCallExpression(node)) {
        const method = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : ts.isIdentifier(node.expression) ? node.expression.text : ''
        const decl = node.parent
        if (/^(useState|useReducer|createMachine|setupMachine)$/.test(method) && ts.isVariableDeclaration(decl)) {
          const name = ts.isArrayBindingPattern(decl.name) ? decl.name.elements[0]?.getText(source) : decl.name.getText(source)
          if (name && (method !== 'useState' || phase.test(name))) {
            const unit = owner(node), signals = owners.get(unit) ?? []
            signals.push({ name, kind: method, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 })
            owners.set(unit, signals)
          }
        }
      }
      ts.forEachChild(node, walk)
    }
    walk(source)
    const file = relative(process.cwd(), path).split(sep).join('/')
    for (const [unit, signals] of owners) rows.push({ file, unit, signals, review: signals.length >= 2 ? 'check transitions and combined states' : 'check lifecycle context' })
  }
}
for (const root of roots) visitDir(root)
rows.sort((a, b) => a.file.localeCompare(b.file) || a.unit.localeCompare(b.unit))
console.log(JSON.stringify({ scanned, units: rows.length, combined: rows.filter(r => r.signals.length >= 2).length, inventory: rows }, null, 2))
