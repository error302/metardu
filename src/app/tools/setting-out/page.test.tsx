import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SettingOutPage from './page'

// Declared reference systems for the synthetic controls in this suite.
const fixtureCrs32737 = 'EPSG:32737'


const syntheticDxf = `0\nSECTION\n2\nENTITIES\n0\nPOINT\n8\nSTAKEOUT\n10\n500010\n20\n9900000\n30\n100\n0\nENDSEC\n0\nEOF`

describe('setting-out source workflow', () => {
  it('uploads synthetic DXF, computes with explicit vertical inputs, and fails closed on incomplete as-built RL', async () => {
    render(<SettingOutPage />)

    const file = new File([syntheticDxf], 'synthetic.dxf', { type: 'application/dxf' })
    fireEvent.change(screen.getByLabelText('DXF File'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByLabelText('Design layer')).toHaveValue('STAKEOUT'))

    fireEvent.change(screen.getByLabelText('Station E'), { target: { value: '500000' } })
    fireEvent.change(screen.getByLabelText('Station N'), { target: { value: '9900000' } })
    fireEvent.change(screen.getByLabelText('Station RL (m)'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Instrument height (m)'), { target: { value: '1.5' } })
    fireEvent.change(screen.getByLabelText('Target height (m)'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Coordinate frame / EPSG'), { target: { value: fixtureCrs32737 } })
    fireEvent.change(screen.getByLabelText('Backsight E'), { target: { value: '500000' } })
    fireEvent.change(screen.getByLabelText('Backsight N'), { target: { value: '9900010' } })
    fireEvent.click(screen.getByRole('button', { name: 'Compute Stakeout List' }))
    await waitFor(() => expect(screen.getByText('2. Stakeout List (1 points)')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('P1,264100.010,9861100.005,1500.002'), {
      target: { value: 'PT001,500010,9900000,' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Compare As-Built vs Design' }))
    expect(await screen.findByText(/Vertical verification is incomplete/)).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByPlaceholderText('P1,264100.010,9861100.005,1500.002'), {
      target: { value: 'PT001,not-a-number,9900000,100' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Compare As-Built vs Design' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/non-finite easting\/northing/i)
    expect(screen.queryByText(/Vertical verification is incomplete/)).not.toBeInTheDocument()
  })
})
