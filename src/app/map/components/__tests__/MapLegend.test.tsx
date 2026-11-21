import { fireEvent, render, screen } from '@testing-library/react'
import { LEGEND_ENTRIES, MapLegend } from '../MapLegend'

it('legend distinguishes sketches from survey data and measurements', () => {
  expect(LEGEND_ENTRIES.map((entry) => entry.id)).toEqual([
    'sketch',
    'survey-point',
    'control-point',
    'measure',
  ])
  expect(LEGEND_ENTRIES[0].hint).toMatch(/excluded from survey exports/)
})

it('legend is collapsed until opened and lists every entry', () => {
  render(<MapLegend />)
  expect(screen.queryByRole('list')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Legend/ }))
  const items = screen.getAllByRole('listitem')
  expect(items).toHaveLength(4)
  expect(screen.getByText('Sketch')).toBeTruthy()
  expect(screen.getByText('Survey point')).toBeTruthy()
})
