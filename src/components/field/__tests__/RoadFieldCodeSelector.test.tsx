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

  it('offers an operator-controlled shortcut to the next code without a point at this chainage', () => {
    const onChange = jest.fn()
    render(
      <RoadFieldCodeSelector
        codes={['CL', 'LE', 'RE']}
        value="CL"
        capturedCodes={['CL']}
        onChange={onChange}
      />,
    )

    const nextCode = screen.getByRole('button', { name: 'Next uncaptured code: LE' })
    expect(nextCode).toBeEnabled()
    fireEvent.click(nextCode)
    expect(onChange).toHaveBeenCalledWith('LE')
    expect(screen.getByText('Suggested order only; it does not mark this station complete.')).toBeInTheDocument()
    expect(screen.getByText('Saved-code badges refer to this chainage only. Repeat a code whenever the field brief calls for more points.')).toBeInTheDocument()
  })

  it('does not suggest a missing code until the selected code has a saved point', () => {
    render(
      <RoadFieldCodeSelector
        codes={['CL', 'LE']}
        value="CL"
        capturedCodes={[]}
        onChange={jest.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'No next uncaptured code' })).toBeDisabled()
  })

  it('disables the shortcut when all selected codes already have a point here', () => {
    render(
      <RoadFieldCodeSelector
        codes={['CL', 'LE']}
        value="LE"
        capturedCodes={['CL', 'LE']}
        onChange={jest.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'No next uncaptured code' })).toBeDisabled()
    expect(screen.getByText('Choose or repeat a code from the list as the field brief requires.')).toBeInTheDocument()
  })
})
