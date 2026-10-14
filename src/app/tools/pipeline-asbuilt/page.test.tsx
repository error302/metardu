import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import PipelineAsBuiltPage from './page'
let container: HTMLDivElement, root: Root
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
async function input(selector: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
  if (!field) throw new Error(`Missing ${selector}`)
  await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set?.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })) })
}
async function analyze() {
  const button = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Analyze Pipeline')
  if (!button) throw new Error('Missing analyze action')
  await act(async () => button.click())
}
const csv = 'point_id,chainage_m,invert_rl_m,ground_rl_m,internal_diameter_mm,outside_diameter_mm,joint_type,remarks\nP1,0,10,10.2,300,400,,exposed\nP2,50,9.5,11,300,400,,measured'
test('the page begins with blank observations and does not assert an unspecified country standard', async () => {
  await act(async () => root.render(<PipelineAsBuiltPage />))
  expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('')
  expect(container.textContent).not.toContain('Kenya Water Pipeline Standards')
})
test('malformed input reports a validation error rather than inventing observations', async () => {
  await act(async () => root.render(<PipelineAsBuiltPage />))
  await input('textarea', 'point_id,chainage_m,invert_rl_m\nP1,0,broken'); await analyze()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('finite decimal')
  expect(container.querySelector('[data-result="pipeline-profile"]')).toBeNull()
})
test('measured exposed cover is signed and any input edit removes stale results and export actions', async () => {
  await act(async () => root.render(<PipelineAsBuiltPage />))
  await input('textarea', csv); await analyze()
  expect(container.querySelector('[data-result="pipeline-profile"]')?.textContent).toContain('-0.150')
  expect(container.textContent).toContain('NOT ASSESSED')
  expect(container.querySelector('[data-export="pipeline-csv"]')).not.toBeNull()
  await input('textarea', csv.replace('10.2', '12'))
  expect(container.querySelector('[data-result="pipeline-profile"]')).toBeNull()
  expect(container.querySelector('[data-export="pipeline-csv"]')).toBeNull()
})
