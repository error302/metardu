import { fireEvent, render, screen } from '@testing-library/react'
import { QuickFieldLSA } from '../QuickFieldLSA'

describe('QuickFieldLSA angular assessment', () => {
  it('keeps angular closure unassessed and prevents a full pass from bearing-only input', () => {
    const onResultReady = jest.fn()
    render(
      <QuickFieldLSA
        observations={[
          { from: 'A', to: 'B', bearing: 0, distance: 100 },
          { from: 'B', to: 'C', bearing: 90, distance: 100 },
          { from: 'C', to: 'D', bearing: 180, distance: 100 },
          { from: 'D', to: 'A', bearing: 270, distance: 100 },
        ]}
        controlPoints={[{ name: 'A', easting: 0, northing: 0 }]}
        onResultReady={onResultReady}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Run Quick Check' }))

    expect(screen.getByText('ANGULAR CHECK REQUIRED')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/Angular closure was not assessed/)
    expect(screen.queryByText(/^PASS$/)).not.toBeInTheDocument()
    expect(onResultReady).toHaveBeenCalledWith(expect.objectContaining({
      angularMisclosure: null,
      angularPass: null,
      overallPass: null,
      precisionPass: true,
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Show Details' }))
    expect(screen.getByText(/Not assessed/)).toBeInTheDocument()
  })
})
