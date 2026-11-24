import { Linter } from 'eslint'
import type { Rule } from 'eslint'
import rule from '../eslint-plugin-metardu/rules/no-hardcoded-crs-default'

/**
 * A silent CRS default is a false authority claim on a deliverable. The
 * lint rule is the guard that stops one coming back, so its own behaviour
 * is pinned here: it must catch the legacy defaults and stay silent on
 * everything else — especially named jurisdiction constants, which are
 * configuration rather than a silent default.
 */
const linter = new Linter()
linter.defineRule(
  'metardu/no-hardcoded-crs-default',
  rule as unknown as Rule.RuleModule,
)

function messagesFor(code: string): string[] {
  const result = linter.verify(code, {
    parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    rules: { 'metardu/no-hardcoded-crs-default': 'error' },
  })
  return result.map((message) => message.message)
}

describe('no-hardcoded-crs-default', () => {
  it('catches a datum fallback', () => {
    const messages = messagesFor("const datum = project.datum || 'Arc 1960'")
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatch(/coordinate reference/i)
  })

  it('catches a combined datum/zone fallback', () => {
    const messages = messagesFor("const cs = project.datum || 'Arc 1960 / UTM Zone 37S'")
    expect(messages).toHaveLength(1)
  })

  it('catches a UTM zone fallback', () => {
    const messages = messagesFor('const zone = input.utmZone ?? 37')
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatch(/UTM zone/i)
  })

  it('catches a hemisphere fallback', () => {
    const messages = messagesFor("const hemi = input.hemisphere ?? 'S'")
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatch(/hemisphere/i)
  })

  it('catches parameter and destructuring defaults', () => {
    expect(messagesFor("function f(datum = 'Arc 1960') {}")).toHaveLength(1)
    expect(messagesFor('function f({ utmZone = 37 }) {}')).toHaveLength(1)
  })

  it('allows a named jurisdiction constant', () => {
    expect(messagesFor('const zone = options?.zone ?? KENYA_UTM_ZONE')).toHaveLength(0)
  })

  it('allows a NOT DECLARED fallback', () => {
    expect(messagesFor("const datum = project.datum || 'NOT DECLARED'")).toHaveLength(0)
  })

  it('does not fire on unrelated numbers and letters', () => {
    expect(messagesFor('const longitude = settings.longitude ?? 37')).toHaveLength(0)
    expect(messagesFor("const status = row.status || 'S'")).toHaveLength(0)
    expect(messagesFor('const zone = row.zone || 5')).toHaveLength(0)
  })

  it('does not fire on a declared value that happens to be Arc 1960', () => {
    expect(messagesFor("const datum = 'Arc 1960'")).toHaveLength(0)
  })
})
