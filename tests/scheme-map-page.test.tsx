import { fireEvent, render, screen } from '@testing-library/react'
import SchemeMapPage from '@/app/project/[id]/scheme/map/page'
import type { SchemeViewportStatus } from '@/lib/map/schemeLayer'
import {
  schemeExtent,
  schemeViewport,
  schemeProject,
} from './fixtures/schemeView'
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '33333333-3333-4333-8333-333333333333' }),
}))
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () =>
    function Canvas({
      onStatus,
      onError,
    }: {
      onStatus: (value: SchemeViewportStatus) => void
      onError: (error: string) => void
    }) {
      return (
        <div>
          <button
            onClick={() =>
              onStatus({
                loading: false,
                error: null,
                message: '10,000 records represented by visual groups.',
                view: schemeViewport(),
                extent: schemeExtent(),
              })
            }
          >
            Receive view
          </button>
          <button onClick={() => onError('Read unavailable')}>Fail view</button>
        </div>
      )
    },
}))
it('shows whole-project counts and links to real review stages', () => {
  render(<SchemeMapPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Receive view' }))
  expect(screen.getByText(/10,000 parcel records/)).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('visual groups')
  expect(
    screen.getByRole('link', { name: 'Review registered outputs' }),
  ).toHaveAttribute('href', `/project/${schemeProject}/deliver`)
  expect(
    screen.queryByRole('link', { name: /export/i }),
  ).not.toBeInTheDocument()
  expect(screen.getByLabelText('Geometry review legend')).toBeInTheDocument()
})
it('reports unavailable data without a false zero and reloads explicitly', () => {
  render(<SchemeMapPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Fail view' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Read unavailable')
  expect(
    screen.getByText(/reference and geometry register are unavailable/),
  ).toBeInTheDocument()
  expect(screen.queryByText(/0 parcel records/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reload geometry' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(
    screen.getByText(/Loading the saved project reference/),
  ).toBeInTheDocument()
})
