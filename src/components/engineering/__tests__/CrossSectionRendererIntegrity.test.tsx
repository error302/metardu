import React from 'react'
import { render, screen } from '@testing-library/react'
import { CrossSectionRenderer } from '../CrossSectionRenderer'

const template = { carriagewayWidth: 6, shoulderWidth: 1, shoulderCrossfall: 0, cutSlope: '1:2', fillSlope: '1:1.5', camber: 0, subgradeDepth: 0 }
it('does not invent an approved formation level from ground observations', () => {
  render(<CrossSectionRenderer chainage={0} template={template} groundPoints={[{ offset: -10, level: 1 }, { offset: 10, level: 1 }]} />)
  expect(screen.getByRole('status')).toHaveTextContent(/formation/i)
})
it('reports insufficient ground extent instead of crashing the drawing', () => {
  render(<CrossSectionRenderer chainage={0} formationLevel={0} template={template} groundPoints={[{ offset: -1, level: 1 }, { offset: 1, level: 1 }]} />)
  expect(screen.getByRole('status')).toHaveTextContent(/ground|extend/i)
})
it('blocks a profile that covers shoulders but not measured daylight', () => {
  render(<CrossSectionRenderer chainage={0} formationLevel={0} template={template} groundPoints={[{ offset: -4, level: 1 }, { offset: 4, level: 1 }]} />)
  expect(screen.getByRole('status')).toHaveTextContent(/daylight|extend/i)
})
it('rejects stale supplied areas instead of overriding the current measured profile', () => {
  render(<CrossSectionRenderer chainage={0} formationLevel={0} template={template} cutArea={9999} fillArea={0} groundPoints={[{ offset: -10, level: 1 }, { offset: 10, level: 1 }]} />)
  expect(screen.getByRole('status')).toHaveTextContent(/area|current/i)
})
it('renders a valid zero-shoulder template without duplicate formation vertices', () => {
  const { container } = render(<CrossSectionRenderer chainage={0} formationLevel={0} template={{ ...template, shoulderWidth: 0 }} groundPoints={[{ offset: -10, level: 1 }, { offset: 10, level: 1 }]} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(container.querySelector('svg')).not.toBeNull()
})
it('uses pixel-space viewBox bounds for the pixel-space drawing coordinates', () => {
  render(<CrossSectionRenderer chainage={0} formationLevel={0} template={template} groundPoints={[{ offset: -10, level: 1 }, { offset: 10, level: 1 }]} />)
  expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 800 400')
})
