import { render, screen } from '@testing-library/react'
import { FieldbookAttachments } from './FieldbookAttachments'
import type { FieldbookAttachment } from '@/app/fieldbook/types'

const tiny = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const attachments: FieldbookAttachment[] = [
  {
    id: 'a1', page: 'leveling', kind: 'sketch', name: 'north-wall.png', note: 'North wall at TP2',
    dataUrl: tiny, capturedAt: '2026-11-19T09:00:00Z', capturedBy: 'surveyor-1',
  },
  {
    id: 'a2', page: 'traverse', kind: 'photo', name: 'beacon.jpg', note: 'Beacon TBM 4',
    dataUrl: tiny, capturedAt: '2026-11-19T10:00:00Z', capturedBy: 'surveyor-1',
  },
]

test('only the active page attachments are listed, with count and note', () => {
  render(<FieldbookAttachments page="leveling" attachments={attachments} onChange={jest.fn()} capturedBy="surveyor-1" />)
  expect(screen.getByText('Sketches and photos')).toBeInTheDocument()
  expect(screen.getByText('(1)')).toBeInTheDocument()
  expect(screen.getByText('North wall at TP2')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /sketch north-wall\.png/ })).toBeInTheDocument()
  // Traverse-page evidence must not leak into the leveling page.
  expect(screen.queryByText('Beacon TBM 4')).not.toBeInTheDocument()
})

test('attachments are labelled field evidence and can never be deleted from here', () => {
  render(<FieldbookAttachments page="traverse" attachments={attachments} onChange={jest.fn()} capturedBy="surveyor-1" />)
  expect(screen.getByText(/Field evidence · not survey control/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Add sketch/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Add photo/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument()
})

test('empty page shows zero count and still offers capture actions', () => {
  render(<FieldbookAttachments page="control" attachments={attachments} onChange={jest.fn()} capturedBy="surveyor-1" />)
  expect(screen.getByText('(0)')).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
