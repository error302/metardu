import { fireEvent, render, screen } from '@testing-library/react'
import { RoadFieldPlanStep } from './RoadFieldPlanStep'

describe('RoadFieldPlanStep station preflight', () => {
  it('offers saved station limits and a validated declared project CRS as operator-applied suggestions', () => {
    render(
      <RoadFieldPlanStep
        projectId="project-1"
        projectName="North access road"
        roadDesign={{
          roadName: 'North access road',
          startChainage: 0,
          datum: 'Arc 1960',
          coordinateSystem: 'UTM Zone 37S',
          designSpeed: 50,
          roadClass: 'C',
          ips: [],
          vips: [],
          crossSectionTemplate: { carriagewayWidth: 6, shoulderWidth: 1, cutSlope: '1:1', fillSlope: '1:1.5', camber: 3, subgradeDepth: 0.5 },
          stations: [
            { chainage: 100, groundLevel: 0 },
            { chainage: 140, groundLevel: 0 },
            { chainage: 180, groundLevel: 0 },
          ],
        }}
        projectCrsSuggestion="Arc 1960 / UTM zone 37S (EPSG:21037)"
        data={null}
        onSave={jest.fn().mockResolvedValue(true)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Use saved station limits' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use declared project CRS' }))

    expect(screen.getByLabelText('Start chainage (m)')).toHaveValue(100)
    expect(screen.getByLabelText('End chainage (m)')).toHaveValue(180)
    expect(screen.getByLabelText('Project CRS (from project settings)')).toHaveValue('Arc 1960 / UTM zone 37S (EPSG:21037)')
    expect(screen.getByLabelText('Station interval (m)')).toHaveValue(null)
  })

  it('previews planned stations and calls out a shorter exact endpoint interval', () => {
    render(
      <RoadFieldPlanStep
        projectId="project-1"
        projectName="North access road"
        projectCrsSuggestion="WGS 84 / UTM zone 37S (EPSG:32737)"
        data={null}
        onSave={jest.fn().mockResolvedValue(true)}
      />,
    )

    fireEvent.change(screen.getByLabelText('Start chainage (m)'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('End chainage (m)'), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText('Station interval (m)'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use declared project CRS' }))
    fireEvent.change(screen.getByLabelText('Control / benchmark ID and source'), { target: { value: 'BM-01 · approved project control list' } })
    fireEvent.change(screen.getByLabelText('Control / benchmark ID and source'), { target: { value: 'BM-01 · approved project control list' } })

    expect(screen.getByText('4 planned stations')).toBeInTheDocument()
    expect(screen.getByText('0+000.000')).toBeInTheDocument()
    expect(screen.getByText('0+020.000')).toBeInTheDocument()
    expect(screen.getByText('0+040.000')).toBeInTheDocument()
    expect(screen.getByText('0+050.000')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('The exact end chainage is included. The final step is 10.000 m, shorter than the requested 20.000 m interval.')
  })

  it('blocks a saved plan whose CRS differs from the project reference system', () => {
    render(
      <RoadFieldPlanStep
        projectId="project-1"
        projectName="North access road"
        projectCrsSuggestion="WGS 84 / UTM zone 37S (EPSG:32737)"
        data={{
          startChainageM: 0,
          endChainageM: 50,
          stationIntervalM: 20,
          leftExtentM: null,
          rightExtentM: null,
          projectCrs: 'Arc 1960 / UTM zone 37S (EPSG:21037)',
          controlReference: 'BM-01 / approved control list',
          featureCodes: ['CL'],
        }}
        onSave={jest.fn().mockResolvedValue(true)}
      />,
    )

    expect(screen.getByText('The field plan CRS must match the project reference system. Apply the project CRS suggestion again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save field plan' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'Start road point collection →' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Use declared project CRS' }))

    expect(screen.queryByText('The field plan CRS must match the project reference system. Apply the project CRS suggestion again.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save field plan' })).toBeEnabled()
  })
})
