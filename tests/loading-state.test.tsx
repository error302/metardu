/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'

import { LoadingState } from '@/components/shared/LoadingState'

describe('shared loading state', () => {
  it('renders a static METARDU brand lockup without an animated background', () => {
    const { container } = render(<LoadingState message="Loading map" />)

    expect(container.querySelector('.metardu-loading-ascii')).toBeNull()
    expect(container.querySelector('.metardu-loading-scrim')).toBeNull()

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-label', 'Loading map')
    expect(screen.getByText('METARDU')).toBeInTheDocument()

    const logo = status.querySelector('img')
    expect(logo).not.toBeNull()
    expect(logo).toHaveAttribute('width', '64')
    expect(logo).toHaveAttribute('height', '64')
    expect(logo).toHaveClass('object-contain')
  })
})
