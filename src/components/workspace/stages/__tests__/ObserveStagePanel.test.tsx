import { render, screen } from '@testing-library/react'
import ObserveStagePanel from '../ObserveStagePanel'

jest.mock('@/components/workspace/DynamicFieldBook', () => () => <div>Field book</div>)

afterEach(() => jest.restoreAllMocks())

it('shows existing batches from the actual top-level batches response', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ batches: [{
    id: 'synthetic-batch', batch_number: 'SYNTHETIC-EXISTING', source_type: 'manual', status: 'raw',
    created_at: '2026-10-20T00:00:00Z', source_file_hash: null,
  }] }) })
  render(<ObserveStagePanel projectId="synthetic-project" />)
  expect(await screen.findByText('SYNTHETIC-EXISTING')).toBeInTheDocument()
  expect(screen.queryByText('No observation batches registered for this project yet.')).not.toBeInTheDocument()
})

it('reports an invalid response instead of presenting it as an empty register', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ unexpected: [] }) })
  render(<ObserveStagePanel projectId="synthetic-project" />)
  expect(await screen.findByText(/Observation batch response is invalid/)).toBeInTheDocument()
})
