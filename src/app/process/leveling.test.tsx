import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Page from './page'
jest.mock('@/lib/api-client/client', () => ({ createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) }))
jest.mock('@/components/SolutionStepsRenderer', () => ({ __esModule: true, default: () => <div>Worked steps</div> }))

async function upload(content = 'Station,BS,FS\nBM,1.5,\nCLOSE,,1.496', count = 2) {
  const { container } = render(<Page />)
  const file = new File([], 'synthetic-levels.csv', { type: 'text/csv' })
  Object.defineProperty(file, 'text', { value: async () => content })
  const input = container.querySelector('input[type=file]')
  if (!input) throw new Error('Upload control is missing')
  fireEvent.change(input, { target: { files: [file] } })
  await screen.findByText(`${count} observations found`)
}

test('uploaded leveling notes require an explicit opening benchmark', async () => {
  await upload()
  fireEvent.click(screen.getByRole('button', { name: 'Process Survey' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Opening RL/))
  expect(screen.queryByText('Worked steps')).not.toBeInTheDocument()
})

test('entered zero setup reduces notes while unknown closure stays incomplete', async () => {
  await upload()
  fireEvent.change(screen.getByLabelText('Opening RL (m)'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Process Survey' }))
  await screen.findByText('Worked steps')
  expect(screen.getByText('Tolerance Check: INCOMPLETE')).toBeInTheDocument()
  expect(screen.getAllByText('0.0000').length).toBeGreaterThan(0)
})

test('supplied setup and actual run length reach the profile assessment', async () => {
  await upload()
  fireEvent.change(screen.getByLabelText('Opening RL (m)'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Closing RL (m)'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Run length (km)'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Process Survey' }))
  await screen.findByText('Worked steps')
  expect(screen.getByText('Closing error 4.0mm within allowable 10.0mm')).toBeInTheDocument()
})

test('turning-point FS and BS both reach the reduction without dropping a sight', async () => {
  await upload('Station,BS,IS,FS\nBM,1.5,,\nTP,0.75,,1.25\nCLOSE,,,0.8', 3)
  fireEvent.change(screen.getByLabelText('Opening RL (m)'), { target: { value: '100' } })
  fireEvent.click(screen.getByRole('button', { name: 'Process Survey' }))
  await screen.findByText('Worked steps')
  expect(screen.getByText('100.2000')).toBeInTheDocument()
  expect(screen.getByText('0.750')).toBeInTheDocument()
  expect(screen.getByText('1.250')).toBeInTheDocument()
})
