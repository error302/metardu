import { fireEvent, render, screen } from '@testing-library/react'
import { RoadPanel } from '../panels/RoadPanel'

test('road panel refuses unresolved horizontal stationing and supports correction', () => {
  render(<RoadPanel projectId="synthetic-project" subtype="road" />)
  fireEvent.click(screen.getByRole('button', { name: /^horizontal curves$/i }))
  for (const [label, value] of [['Radius (m)', '100'], ['Deflection (°)', '60'], ['PI chainage (m)', '1e30']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Calculate curve' }))
  expect(screen.getByRole('alert')).toHaveTextContent(/precision|represent/i)
  expect(screen.queryByText('Curve 1')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('PI chainage (m)'), { target: { value: '500' } })
  fireEvent.click(screen.getByRole('button', { name: 'Calculate curve' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText('Curve 1')).toBeInTheDocument()
})
