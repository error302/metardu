import { render, screen } from '@testing-library/react'
import { bowditchAdjustment } from '@/lib/engine/traverse'
import { TraverseBook } from './TraverseBook'

test('an exact computed closure is not replaced by an invented finite precision ratio', () => {
  const adjusted = bowditchAdjustment({ points: [{ name: 'A', easting: 0, northing: 0 }, { name: 'B', easting: 0, northing: 100 }],
    distances: [100], bearings: [0], closingPoint: { easting: 0, northing: 100 } })
  render(<TraverseBook t={key => key} travMode="link" startStation="A" startE="0" startN="0" closeE="0" closeN="100"
    setTravMode={jest.fn()} setStartStation={jest.fn()} setStartE={jest.fn()} setStartN={jest.fn()}
    setCloseE={jest.fn()} setCloseN={jest.fn()} travRows={[]} setTravRows={jest.fn()}
    computed={{ ok: true, mode: 'link', adjusted }} />)
  expect(screen.getByText('Zero computed closure')).toBeInTheDocument()
  expect(screen.queryByText(/100,000,000,000,000/)).not.toBeInTheDocument()
})
