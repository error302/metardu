import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import EquipmentPage from '../page'
import { calcStatus, type Equipment } from '@/lib/integrations/equipment'
import { fetchAllEquipment, createEquipmentApi, updateEquipmentApi, logCalibrationApi, fetchCalibrationLogs } from '@/lib/integrations/equipmentApi'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/integrations/equipmentApi', () => ({ fetchAllEquipment: jest.fn(), createEquipmentApi: jest.fn(), updateEquipmentApi: jest.fn(), logCalibrationApi: jest.fn(), fetchCalibrationLogs: jest.fn() }))
const equipment: Equipment = { id: 'instrument', name: 'SYNTHETIC GNSS rover', type: 'gnss', brand: '', model: '', serialNumber: '', purchaseDate: '', lastCalibrationDate: '', intervalDays: 180, location: '', notes: '', createdAt: '2026-10-01T00:00:00Z', lifecycleStatus: 'active' }
const session = (id: string) => ({ data: { user: { id }, expires: '2099-01-01' }, status: 'authenticated', update: jest.fn() } as ReturnType<typeof useSession>)
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useSession).mockReturnValue(session('owner-a'))
  jest.mocked(fetchAllEquipment).mockResolvedValue([calcStatus(equipment)])
  jest.mocked(fetchCalibrationLogs).mockResolvedValue([])
})
const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><EquipmentPage /></QueryClientProvider>)
  return { client, ...view }
}
test('a new instrument is visibly not recorded, without a current countdown', async () => {
  setup()
  expect(await screen.findByText('Not recorded')).toBeVisible()
  expect(screen.queryByText(/days until due/)).not.toBeInTheDocument()
  expect(within(await screen.findByRole('button', { name: /SYNTHETIC GNSS rover/ })).queryByText('Schedule current')).not.toBeInTheDocument()
})
test('an instrument load failure is distinct from an empty register', async () => {
  jest.mocked(fetchAllEquipment).mockRejectedValueOnce(new Error('Synthetic read failure'))
  setup()
  expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic read failure')
  expect(screen.queryByText('No instruments registered')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Retry instrument records' })).toBeVisible()
})
test('a rejected registration keeps its labeled fields and entered details open', async () => {
  jest.mocked(createEquipmentApi).mockRejectedValueOnce(new Error('Synthetic save rejected'))
  setup()
  fireEvent.click(screen.getByRole('button', { name: 'Register instrument' }))
  fireEvent.change(screen.getByLabelText('Instrument name'), { target: { value: 'New instrument' } })
  fireEvent.click(screen.getByRole('button', { name: 'Register instrument' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic save rejected')
  expect(screen.getByRole('dialog', { name: 'Register instrument' })).toBeVisible()
  expect(screen.getByLabelText('Instrument name')).toHaveValue('New instrument')
  expect(screen.queryByLabelText(/Last calibration date/)).not.toBeInTheDocument()
  expect(logCalibrationApi).not.toHaveBeenCalled()
})
test('failed calibration is retained only after an explicit result selection and acknowledgement', async () => {
  jest.mocked(logCalibrationApi).mockResolvedValueOnce({ id: 'record', equipmentId: equipment.id, date: '2026-10-01', nextDate: '2027-03-30', result: 'failed', technician: '', certificate: '', notes: '' })
  setup()
  fireEvent.click(await screen.findByRole('button', { name: /SYNTHETIC GNSS rover/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Log calibration' }))
  expect(screen.getByLabelText('Recorded result')).toHaveValue('')
  fireEvent.change(screen.getByLabelText('Recorded calibration date'), { target: { value: '2026-10-01' } })
  fireEvent.change(screen.getByLabelText('Recorded result'), { target: { value: 'failed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save calibration record' }))
  await waitFor(() => expect(logCalibrationApi).toHaveBeenCalledWith(expect.objectContaining({ equipmentId: equipment.id, date: '2026-10-01', result: 'failed' })))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
test('archiving retains history through an acknowledged metadata update', async () => {
  jest.mocked(updateEquipmentApi).mockResolvedValueOnce(undefined)
  setup()
  fireEvent.click(await screen.findByRole('button', { name: /SYNTHETIC GNSS rover/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Archive instrument' }))
  expect(screen.getByText(/Archiving retains the instrument/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Archive instrument' }))
  await waitFor(() => expect(updateEquipmentApi).toHaveBeenCalledWith(equipment.id, { status: 'inactive' }))
})
test('switching account hides the previous account cache and open dialog', async () => {
  const { client, rerender } = setup()
  fireEvent.click(await screen.findByRole('button', { name: /SYNTHETIC GNSS rover/ }))
  expect(screen.getByRole('dialog')).toBeVisible()
  jest.mocked(useSession).mockReturnValue(session('owner-b'))
  jest.mocked(fetchAllEquipment).mockResolvedValueOnce([])
  rerender(<QueryClientProvider client={client}><EquipmentPage /></QueryClientProvider>)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByText(equipment.name)).not.toBeInTheDocument()
  expect(await screen.findByText('No instruments registered')).toBeVisible()
})
