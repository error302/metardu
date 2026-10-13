import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Step6Outputs } from '../Step6Outputs'
import { Step5Stations } from '../Step5Stations'
import { Step4CrossSection } from '../Step4CrossSection'
import type { RoadDesignData } from '@/types/engineering'
import type { EngineeringProject } from '../../shared'
import { renderStepContent } from '../renderStepContent'
import { getEngineeringSteps } from '../../getEngineeringSteps'

jest.mock('next/dynamic', () => () => () => null)

const project: EngineeringProject = { id: 'synthetic', name: 'Synthetic road', survey_type: 'engineering', utm_zone: 37, hemisphere: 'S',
  projectReferenceSystem: { code: 'EPSG:32737', name: 'WGS84 UTM37S', source: 'declared', hemisphere: 'S', verticalDatum: 'Synthetic BM', distanceMode: 'grid' } }
const data: RoadDesignData = { roadName: 'Synthetic', startChainage: 0, datum: 'WGS84', coordinateSystem: 'EPSG:32737', designSpeed: 40, roadClass: 'C', vips: [],
  ips: [{ id: 'A', name: 'A', easting: 0, northing: 0, radius: 0 }, { id: 'PI', name: 'PI', easting: 100, northing: 0, radius: 20 }, { id: 'B', name: 'B', easting: 100, northing: 100, radius: 0 }],
  crossSectionTemplate: { carriagewayWidth: 6, shoulderWidth: 1, shoulderCrossfall: 0, camber: 0, cutSlope: '2:1', fillSlope: '1.5:1', subgradeDepth: 0 },
  stations: Array.from({ length: 12 }, (_, i) => ({ chainage: 20 * i, groundLevel: 1, designLevel: 0,
    groundProfile: [{ offset: -10, level: 1 }, { offset: 0, level: 1 }, { offset: 10, level: 1 }] })) }

it('shows the measured earthworks and every section, including valid zero design levels', () => {
  render(<Step6Outputs project={project} data={data} />)
  expect(screen.getByLabelText('Total cut volume')).toHaveTextContent('2200.000')
  expect(screen.getAllByRole('table')[1].querySelectorAll('tbody tr')).toHaveLength(12)
  expect(screen.getAllByRole('table')[0].querySelectorAll('tbody tr')).toHaveLength(1)
})

it('offers design and measured offset profile entry without silently saving blank measurements as zero', () => {
  const save = jest.fn()
  render(<Step5Stations data={null} onSave={save} />)
  fireEvent.click(screen.getByRole('button', { name: /Add Station/ }))
  fireEvent.click(screen.getByRole('button', { name: /Add Station/ }))
  expect(screen.getByLabelText('Design surface RL 1')).toBeInTheDocument()
  expect(screen.getByLabelText('Measured ground profile 1')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save Stations' }))
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent(/finite|complete|required/i)
})
it('renders a measured ground/formation drawing in the existing Cross Sections workflow', () => {
  render(<>{renderStepContent('cross_section_view', project, { mode: 'road', standard: 'KRDM2017', road: data }, jest.fn())}</>)
  expect(screen.getByRole('img', { name: /measured road cross-section/i })).toBeInTheDocument()
  expect(getEngineeringSteps({ mode: 'road', standard: 'KRDM2017', road: data }).find(step => step.id === 'export')?.status).toBe('in_progress')
})
it('keeps a blank camber unknown instead of saving it as a zero-percent design', () => {
  const save = jest.fn()
  render(<Step4CrossSection data={data} onSave={save} />)
  fireEvent.change(screen.getByLabelText('Camber (%)'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Template' }))
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent(/finite/i)
})
it('reports a rejected station save instead of silently finishing', async () => {
  const save = jest.fn().mockResolvedValue(false)
  render(<Step5Stations data={data} onSave={save} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save Stations' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not be saved/i))
})
it('saves one surveyed station before a second cross-section has been collected', async () => {
  const save = jest.fn().mockResolvedValue(true)
  render(<Step5Stations data={null} onSave={save} />)
  fireEvent.click(screen.getByRole('button', { name: /Add Station/ }))
  fireEvent.change(screen.getByLabelText('Chainage 1'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Ground RL 1'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Stations' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith([{ chainage: 0, groundLevel: 0, designLevel: undefined, groundProfile: undefined }]))
})
it('can persist an explicitly emptied station list after the operator removes the last record', async () => {
  const save = jest.fn().mockResolvedValue(true)
  render(<Step5Stations data={{ ...data, stations: [data.stations[0]] }} onSave={save} />)
  fireEvent.click(screen.getByRole('button', { name: 'Remove station 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Stations' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith([]))
})
