import { fireEvent, render, screen } from '@testing-library/react'
import { RoadPanel } from '../panels/RoadPanel'

test('road panel reports an unresolvable vertical draft without crashing or retaining it', () => {
  render(<RoadPanel projectId="synthetic-project" subtype="road" />)
  fireEvent.click(screen.getByRole('button', { name: /^vertical curves$/i }))
  for (const [label, value] of [['PVI chainage (m)', '1000'], ['PVI elevation (m)', '1e30'],
    ['Incoming grade (%)', '2'], ['Outgoing grade (%)', '-2'], ['Curve length (m)', '200']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: /calculate.*curve/i }))
  expect(screen.getByRole('alert')).toHaveTextContent(/precision|represent/i)
  expect(screen.queryByText('Vertical Curve 1')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('PVI elevation (m)'), { target: { value: '100' } })
  fireEvent.click(screen.getByRole('button', { name: /calculate.*curve/i }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText('Vertical Curve 1')).toBeInTheDocument()
  expect(screen.getByText(/PVC chainage \/ level:/).parentElement).toHaveTextContent('900.000m / 98.000m')
  expect(screen.getByText(/PVT chainage \/ level:/).parentElement).toHaveTextContent('1100.000m / 98.000m')
  expect(screen.getByText(/Design standards are not assessed/)).toBeInTheDocument()
})
