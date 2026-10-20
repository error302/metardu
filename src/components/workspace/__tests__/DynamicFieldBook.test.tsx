import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import DynamicFieldBook from '../DynamicFieldBook'

const revision = 'a'.repeat(64)
const nextRevision = 'b'.repeat(64)
const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })

it('loads existing rows before editing and preserves retained data in an explicit save', async () => {
  const fetchMock = jest.fn().mockImplementation(async (_url, options?: RequestInit) => ({
    ok: true, json: async () => options?.method === 'PUT' ? { saved: true, revision: nextRevision } : {
      revision, data: [{ station: 'EXISTING', bearing: 90, distance: 42, remark: 'Retained note', raw_data: { target: 'B', source: 'prior-source' } }],
    },
  }))
  global.fetch = fetchMock
  render(<DynamicFieldBook projectId="synthetic" surveyType="cadastral" />)
  expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument()
  expect(await screen.findByDisplayValue('EXISTING')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Distance (m)'), { target: { value: '43' } })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  const options = (fetchMock.mock.calls as unknown as [string, RequestInit][])[1][1]
  const body = JSON.parse(options.body as string) as unknown
  expect(body).toMatchObject({ revision, rows: [{ station: 'EXISTING', target: 'B', distance: '43', remark: 'Retained note', source: 'prior-source' }] })
  expect(await screen.findByText(/^Saved /)).toBeInTheDocument()
})

it('blocks editing when loading fails instead of offering an empty overwrite', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false })
  render(<DynamicFieldBook projectId="synthetic" surveyType="cadastral" />)
  expect(await screen.findByRole('alert')).toHaveTextContent(/preserve existing data/)
  expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Retry loading' })).toBeInTheDocument()
})

it('retains visible edits and reports a concurrent-change rejection', async () => {
  global.fetch = jest.fn().mockImplementation(async (_url, options?: RequestInit) => options?.method === 'PUT'
    ? { ok: false, status: 409, json: async () => ({ error: 'The field book changed. Your edits have not been saved.' }) }
    : { ok: true, json: async () => ({ revision, data: [] }) })
  render(<DynamicFieldBook projectId="synthetic" surveyType="cadastral" />)
  const station = await screen.findByLabelText('Station')
  fireEvent.change(station, { target: { value: 'UNSAVED' } })
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
  expect(await screen.findByText(/The field book changed/)).toBeInTheDocument()
  expect(screen.getByDisplayValue('UNSAVED')).toBeInTheDocument()
  expect(screen.queryByText(/^Saved /)).not.toBeInTheDocument()
})
