import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MapProvider, type MapContextValue } from '../../MapReactContext'
import { MapNotifications } from '../MapNotifications'

function Harness({
  save,
  zone,
  points,
  importMessage,
}: {
  save?: string
  zone?: string | null
  points?: string | null
  importMessage?: string
}) {
  const [saveMsg, setSaveMsg] = useState(save ?? '')
  const value = {
    saveMsg,
    setSaveMsg,
    importMsg: importMessage ?? '',
    projectPointsError: points ?? null,
    zoneWarning: zone ?? null,
  } as unknown as MapContextValue
  return (
    <MapProvider value={value}>
      <MapNotifications />
    </MapProvider>
  )
}

const missingCrs = 'Set the project CRS before drawing survey geometry or calculating measurements.'

it('never blocks the map: the container ignores taps and only the toast accepts them', () => {
  render(<Harness save={missingCrs} />)
  const container = screen.getByTestId('map-notifications')
  expect(container.className).toContain('pointer-events-none')
  const toast = screen.getByRole('status')
  expect(toast.className).toContain('pointer-events-auto')
})

it('dismisses a persistent capture message immediately', () => {
  render(<Harness save={missingCrs} />)
  fireEvent.click(screen.getByRole('button', { name: /Dismiss notification/ }))
  expect(screen.queryByText(missingCrs)).toBeNull()
})

it('auto-clears an unattended save message instead of leaving it over the map', () => {
  jest.useFakeTimers()
  try {
    render(<Harness save={missingCrs} />)
    expect(screen.getByText(missingCrs)).toBeTruthy()
    act(() => {
      jest.advanceTimersByTime(7000)
    })
    expect(screen.queryByText(missingCrs)).toBeNull()
  } finally {
    jest.useRealTimers()
  }
})

it('stacks separate messages and lets the surveyor dismiss each one', () => {
  render(<Harness zone="This project straddles two UTM zones." points="Project points could not be loaded." />)
  expect(screen.getByText('This project straddles two UTM zones.')).toBeTruthy()
  expect(screen.getByText('Project points could not be loaded.')).toBeTruthy()
  const dismissButtons = screen.getAllByRole('button', { name: /Dismiss notification/ })
  expect(dismissButtons).toHaveLength(2)
  fireEvent.click(dismissButtons[0])
  expect(screen.queryByText('This project straddles two UTM zones.')).toBeNull()
  expect(screen.getByText('Project points could not be loaded.')).toBeTruthy()
})
