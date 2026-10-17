import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UniversalMobileObservationForm } from './UniversalMobileObservationForm'

jest.mock('./BeaconPhotoCapture', () => ({ BeaconPhotoCapture: () => null }))
jest.mock('./RapidPointKeypad', () => ({ RapidPointKeypad: () => null }))
jest.mock('@/components/shared/VoiceDictationButton', () => ({ VoiceDictationButton: () => null }))

it('shows a save failure, retains the observation and reuses its ID on retry', async () => {
  const onAdd = jest.fn<Promise<void>, [Record<string, string>, unknown[]]>().mockRejectedValueOnce(new Error('Device storage full')).mockResolvedValue(undefined)
  const onClose = jest.fn()
  render(<UniversalMobileObservationForm surveyType="leveling" initialValues={{ id: 'reading-1', station: 'TP1', bs: '1.023', is: '', fs: '', remarks: 'Road edge' }} onAdd={onAdd} onClose={onClose} />)
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Reading' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Device storage full')
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save Reading' }))
  await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(2))
  expect(onAdd.mock.calls[0][0]).toEqual(onAdd.mock.calls[1][0])
  expect(onAdd.mock.calls[1][0]).toMatchObject({ id: 'reading-1', bs: '1.023', remarks: 'Road edge' })
  await waitFor(() => expect(onClose).toHaveBeenCalled())
})

it('keeps face observations that are not exposed by the mobile editor', async () => {
  const onAdd = jest.fn<Promise<void>, [Record<string, string>, unknown[]]>().mockResolvedValue(undefined)
  render(<UniversalMobileObservationForm surveyType="traverse" initialValues={{ id: 'leg-1', station: 'CP2', bearing: '45.5', slopeDist: '50.010', vaDeg: '90', hclDeg: '45', hclMin: '30', hclSec: '1', hcrDeg: '225', vaMin: '0', vaSec: '2', remarks: '' }} onAdd={onAdd} onClose={() => {}} />)
  for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Reading' }))
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'leg-1', hclSec: '1', hcrDeg: '225', vaSec: '2' }), []))
})
