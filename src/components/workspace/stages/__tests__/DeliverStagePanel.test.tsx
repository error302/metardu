import { act, fireEvent, render, screen } from '@testing-library/react'
import DeliverStagePanel from '../DeliverStagePanel'

jest.mock('@/components/workspace/FormC22Generator', () => ({ __esModule: true, default: () => null }))
const originalFetch = global.fetch
const mockFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>()
const document = { id: 'd1', project_id: 'p1', document_type: 'deed_plan', title: 'Synthetic retained plan', source_revision: 'source-r4', current_revision: 2, status: 'APPROVED' }
const response = (body: unknown) => ({ ok: true, json: async () => body }) as Response
beforeEach(() => { mockFetch.mockReset(); global.fetch = mockFetch })
afterEach(() => { global.fetch = originalFetch })

test('does not claim an empty register or known approval before the first read completes', () => {
  mockFetch.mockReturnValue(new Promise(() => {}))
  render(<DeliverStagePanel projectId="p1" projectName="Synthetic survey" />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading document register')
  expect(screen.queryByText(/Nothing issued yet/)).not.toBeInTheDocument()
  expect(screen.getByText('APPROVAL NOT CONFIRMED')).toBeInTheDocument()
})

test.each([{}, { data: { deliverables: null } }, { data: { deliverables: [{ ...document, project_id: 'p2' }] } }])('malformed or foreign records remain unavailable (%j)', async payload => {
  mockFetch.mockResolvedValue(response(payload))
  render(<DeliverStagePanel projectId="p1" projectName="Synthetic survey" />)
  await act(async () => {})
  expect(screen.getByRole('alert')).toHaveTextContent('Document register could not be loaded')
  expect(screen.queryByText(/Nothing issued yet/)).not.toBeInTheDocument()
})

test('preserves confirmed records after a failed refresh and allows retry', async () => {
  mockFetch.mockResolvedValueOnce(response({ data: { deliverables: [document] } })).mockRejectedValueOnce(new Error('Synthetic offline')).mockResolvedValueOnce(response({ data: { deliverables: [] } }))
  render(<DeliverStagePanel projectId="p1" projectName="Synthetic survey" />)
  await act(async () => {})
  expect(screen.getByText(/Synthetic retained plan/)).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh document register' })) })
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.getByText(/Synthetic retained plan/)).toBeInTheDocument()
  expect(screen.getByText('APPROVAL NOT CONFIRMED')).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry document register' })) })
  expect(screen.getByText(/Nothing issued yet/)).toBeInTheDocument()
})

test('a project switch hides old records and aborts its read', async () => {
  let finish!: (value: Response) => void
  mockFetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce(response({ data: { deliverables: [] } }))
  const view = render(<DeliverStagePanel projectId="p1" projectName="First survey" />)
  const signal = mockFetch.mock.calls[0][1]?.signal
  view.rerender(<DeliverStagePanel projectId="p2" projectName="Second survey" />)
  await act(async () => { finish(response({ data: { deliverables: [document] } })) })
  expect(signal?.aborted).toBe(true)
  expect(screen.queryByText(/Synthetic retained plan/)).not.toBeInTheDocument()
  expect(screen.getByText(/Nothing issued yet/)).toBeInTheDocument()
})
