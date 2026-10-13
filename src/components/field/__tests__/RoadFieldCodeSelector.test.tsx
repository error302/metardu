import { fireEvent, render, screen } from '@testing-library/react'
import { RoadFieldCodeSelector } from '../RoadFieldCodeSelector'

describe('RoadFieldCodeSelector', () => {
  it('shows full code meanings, selected state, and points already saved at the current chainage', () => {
    const onChange = jest.fn()
    render(
      <RoadFieldCodeSelector
        codes={['CL', 'LE']}
        value="CL"
        capturedCodes={['CL']}
        onChange={onChange}
      />,
    )

    expect(screen.getByRole('button', { name: /CL.*Centreline.*saved at this chainage/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Saved here')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /LE.*Left road edge/i })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: /LE.*Left road edge/i }))
    expect(onChange).toHaveBeenCalledWith('LE')
  })
})
