import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import FieldSetOutPage from '../page'

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('projectId=project-1&definitionId=definition-1'),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => {
    return React.createElement('a', { href, ...props }, children)
  },
}))

jest.mock('@/lib/field/setoutQueue', () => ({
  deliverShot: jest.fn(),
  flushQueuedShots: jest.fn().mockResolvedValue({ delivered: 0, queued: 0 }),
  listQueuedShots: jest.fn().mockResolvedValue([]),
  saveShotLocally: jest.fn(),
}))

const definitions = [{
  id: 'definition-1',
  name: 'Drainage set-out',
  structure_type: 'drainage',
  crs: 'EPSG:21037',
  metadata: { source: 'project_drainage' },
}]

const points = [
  {
    label: 'DR-00001', easting: 500000, northing: 9800000, design_rl: 100,
    point_type: 'drainage_station', revision: 1,
    metadata: { pipeId: 'MH-A-MH-B', stationRole: 'Pipe start' },
  },
  {
    label: 'DR-00002', easting: 500050, northing: 9800000, design_rl: 99.5,
    point_type: 'drainage_station', revision: 1,
    metadata: { pipeId: 'MH-A-MH-B', stationRole: 'Intermediate' },
  },
]

const originalFetch = global.fetch
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  const queue = jest.requireMock('@/lib/field/setoutQueue') as { listQueuedShots: jest.Mock }
  queue.listQueuedShots.mockReset().mockResolvedValue([])
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const data = url.includes('definitionId=')
      ? { points, register: [] }
      : { definitions, register: [] }
    return { ok: true, json: async () => ({ data }) } as Response
  })
})

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  global.fetch = originalFetch
  jest.clearAllMocks()
})

async function renderPage() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<FieldSetOutPage />)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  await waitForText('Target DR-00001')
}

async function waitForText(expected: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (container.textContent?.includes(expected)) return
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
  }
  throw new Error(`Timed out waiting for text: ${expected}`)
}

function inputFor(label: string): HTMLInputElement {
  const input = container.querySelector(`[aria-label="${label}"]`)
  if (!(input instanceof HTMLInputElement)) throw new Error(`Input not found: ${label}`)
  return input
}

test('exports the selected project definition and revision while disclosing device-only exclusions', async () => {
  await renderPage()
  const link = Array.from(container.querySelectorAll('a')).find((candidate) =>
    candidate.textContent?.includes('Download saved set-out shot history'))
  expect(link?.getAttribute('href')).toBe('/api/project/project-1/setout/export?definitionId=definition-1&revision=1')
  expect(container.textContent).toContain('Device-only shots are excluded')
  expect(container.textContent).toContain('Recorded status is historical')
  const printable = Array.from(container.querySelectorAll('a')).find((candidate) =>
    candidate.textContent?.includes('Download printable draft cut sheet'))
  expect(printable?.getAttribute('href')).toBe('/api/project/project-1/setout/export?definitionId=definition-1&revision=1&format=html')
  const pdf = Array.from(container.querySelectorAll('a')).find((candidate) =>
    candidate.textContent?.includes('Download draft cut sheet (PDF)'))
  expect(pdf?.getAttribute('href')).toBe('/api/project/project-1/setout/export?definitionId=definition-1&revision=1&format=pdf')
})

function recordButton(): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes('Record field observation') ||
    candidate.textContent?.includes('Improve fix / complete required reading')
  )
  if (!(button instanceof HTMLButtonElement)) throw new Error('Record field observation button not found')
  return button
}

async function enter(label: string, value: string) {
  await act(async () => {
    const input = inputFor(label)
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

test('does not accept a 3D drainage set-out without an observed RL', async () => {
  await renderPage()
  await enter('Observed easting', '500000')
  await enter('Observed northing', '9800000')

  await waitForText('An observed RL is required to verify this 3D set-out target.')
  expect(inputFor('Observed reduced level').getAttribute('aria-required')).toBe('true')
  const recordButton = Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Improve fix / complete required reading')
  )
  expect(recordButton?.disabled).toBe(true)
})

test('does not treat empty or whitespace horizontal readings as zero coordinates', async () => {
  await renderPage()

  expect(recordButton().disabled).toBe(true)
  expect(container.textContent).toContain('Enter both observed Easting and Northing before recording a shot.')

  await enter('Observed easting', '500000')
  await enter('Observed northing', '   ')

  expect(recordButton().disabled).toBe(true)
  expect(container.textContent).toContain('Enter both observed Easting and Northing before recording a shot.')
})

test('shows signed corrections in the declared project grid', async () => {
  await renderPage()
  await enter('Observed easting', '500000.025')
  await enter('Observed northing', '9800000.01')
  await enter('Observed reduced level', '99.98')
  await enter('Fix accuracy', '0.006')

  expect(container.textContent).toContain('Correction to design (project grid)')
  expect(container.textContent).toContain('ΔE -25 mm')
  expect(container.textContent).toContain('ΔN -10 mm')
  expect(container.textContent).toContain('ΔRL +20 mm')
  expect(container.textContent).toContain('they are not compass directions')
})

test('an unknown fix accuracy cannot be accepted as an on-target shot', async () => {
  await renderPage()
  await enter('Observed easting', '500000')
  await enter('Observed northing', '9800000')
  await enter('Observed reduced level', '100')
  await enter('Fix accuracy', '0')

  await waitForText('Reported fix accuracy is 0 (unknown)')
  expect(recordButton().disabled).toBe(true)
})

test('treats a whitespace observed RL as missing on a three-dimensional drainage target', async () => {
  await renderPage()
  await enter('Observed easting', '500000')
  await enter('Observed northing', '9800000')
  await enter('Observed reduced level', '   ')

  await waitForText('An observed RL is required to verify this 3D set-out target.')
  expect(recordButton().disabled).toBe(true)
})

test('shows the latest observation result and fix accuracy without implying every shot passed', async () => {
  const register = [{
    definition_id: 'definition-1',
    label: 'DR-00001',
    result: 'FAIL',
    horizontal_error: 0.032,
    vertical_error: 0.007,
    reported_accuracy_m: 0.012,
    staked_at: '2026-10-07T08:30:00.000Z',
  }]
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const data = url.includes('definitionId=')
      ? { points, register }
      : { definitions, register }
    return { ok: true, json: async () => ({ data }) } as Response
  })

  await renderPage()

  expect(container.textContent).toContain('Latest recorded shot · FAIL')
  expect(container.textContent).toContain('H 32.0 mm')
  expect(container.textContent).toContain('V 7.0 mm')
  expect(container.textContent).toContain('Fix ±12.0 mm')
  expect(container.querySelector('[aria-label="DR-00001, latest result FAIL"]')).not.toBeNull()
  expect(container.textContent).toContain('1/2 recorded')
})

test('flushes device-first set-out records when the field screen opens online', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  const queue = jest.requireMock('@/lib/field/setoutQueue') as { flushQueuedShots: jest.Mock }

  await renderPage()

  expect(queue.flushQueuedShots).toHaveBeenCalledWith('project-1')
})

test('shows rejected local shot details and lets the surveyor download them for review', async () => {
  const queue = jest.requireMock('@/lib/field/setoutQueue') as { listQueuedShots: jest.Mock }
  queue.listQueuedShots.mockResolvedValue([{
    id: 'shot-local-1',
    projectId: 'project-1',
    definitionId: 'definition-1',
    label: 'DR-00003',
    observedEasting: 500000.025,
    observedNorthing: 9800000.01,
    observedRL: 99.48,
    accuracyM: 0.006,
    result: 'FAIL',
    designEasting: 500000,
    designNorthing: 9800000,
    designRL: 99.5,
    designRevision: 4,
    capturedAt: '2026-10-07T08:30:00.000Z',
    synced: false,
    syncStatus: 'rejected',
    syncError: 'This target changed after the shot was captured.',
  }])

  const createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  const createObjectURL = jest.fn(() => 'blob:rejected-shot')
  const revokeObjectURL = jest.fn()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
  const clickDownload = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  try {
    await renderPage()

    expect(container.textContent).toContain('1 local shot need review')
    expect(container.textContent).toContain('Local capture judgement: FAIL')
    expect(container.textContent).toContain('dE')
    expect(container.textContent).toContain('25.0 mm')
    expect(container.textContent).toContain('This target changed after the shot was captured.')
    expect(container.textContent).toContain('not on the project register')

    await act(async () => {
      const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes('Download review file'))
      if (!(button instanceof HTMLButtonElement)) throw new Error('Rejected shot download button not found')
      button.click()
    })
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(clickDownload).toHaveBeenCalled()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:rejected-shot')
  } finally {
    clickDownload.mockRestore()
    if (createDescriptor) Object.defineProperty(URL, 'createObjectURL', createDescriptor)
    else Reflect.deleteProperty(URL, 'createObjectURL')
    if (revokeDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor)
    else Reflect.deleteProperty(URL, 'revokeObjectURL')
  }
})

test('reports an unknown local queue instead of showing zero pending shots', async () => {
  const queue = jest.requireMock('@/lib/field/setoutQueue') as { listQueuedShots: jest.Mock }
  queue.listQueuedShots.mockRejectedValue(new Error('IndexedDB unavailable'))

  await renderPage()

  await waitForText('pending shot count is unknown')
  expect(container.textContent).toContain('Local queue unavailable')
})

test('changing the selected point discards coordinates measured for the previous target', async () => {
  await renderPage()
  await enter('Observed easting', '500000.001')
  await enter('Observed northing', '9800000')
  await enter('Observed reduced level', '100.001')

  await act(async () => {
    const button = container.querySelector('button[aria-label="DR-00002, not recorded"]')
    if (!(button instanceof HTMLButtonElement)) throw new Error('Second drainage target button not found')
    button.click()
  })
  await waitForText('Target DR-00002')

  expect(inputFor('Observed easting').value).toBe('')
  expect(inputFor('Observed northing').value).toBe('')
  expect(inputFor('Observed reduced level').value).toBe('')
})
