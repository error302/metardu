import { fireEvent, render, screen } from '@testing-library/react'
import { RoadFieldPlanStep } from './RoadFieldPlanStep'

describe('RoadFieldPlanStep station preflight', () => {
  it('previews planned stations and calls out a shorter exact endpoint interval', () => {
    render(
      <RoadFieldPlanStep
        projectId="project-1"
        projectName="North access road"
        data={null}
        onSave={jest.fn().mockResolvedValue(true)}
      />,
    )

    fireEvent.change(screen.getByLabelText('Start chainage (m)'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('End chainage (m)'), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText('Station interval (m)'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Approved project CRS'), { target: { value: 'PROJECT-CRS-TEST-01' } })
    fireEvent.change(screen.getByLabelText('Control / benchmark ID and source'), { target: { value: 'BM-01 · approved project control list' } })

    expect(screen.getByText('4 planned stations')).toBeInTheDocument()
    expect(screen.getByText('0+000.000')).toBeInTheDocument()
    expect(screen.getByText('0+020.000')).toBeInTheDocument()
    expect(screen.getByText('0+040.000')).toBeInTheDocument()
    expect(screen.getByText('0+050.000')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('The exact end chainage is included. The final step is 10.000 m, shorter than the requested 20.000 m interval.')
  })
})
