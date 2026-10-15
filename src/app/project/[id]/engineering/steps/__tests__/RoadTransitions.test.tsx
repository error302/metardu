import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Step2Horizontal } from '../Step2Horizontal'
import { Step6Outputs } from '../Step6Outputs'
import type { IntersectionPoint, RoadDesignData } from '@/types/engineering'
import type { EngineeringProject } from '../../shared'

const data: RoadDesignData = { roadName: 'Synthetic', startChainage: 0, datum: 'Declared', coordinateSystem: 'EPSG:32737', designSpeed: 40, roadClass: 'C', vips: [],
  ips: [{ id: 'a', name: 'A', easting: 0, northing: 0, radius: 0 }, { id: 'pi', name: 'PI', easting: 0, northing: 1000, radius: 300 }, { id: 'b', name: 'B', easting: 1000, northing: 1000, radius: 0 }], stations: [],
  crossSectionTemplate: { carriagewayWidth: 6, shoulderWidth: 0, camber: 0, subgradeDepth: 0, cutSlope: '2:1', fillSlope: '2:1' } }
const project: EngineeringProject = { id: 'synthetic', name: 'Synthetic', survey_type: 'engineering', utm_zone: 37, hemisphere: 'S', projectReferenceSystem: { code: 'EPSG:32737', name: 'Declared', source: 'declared', verticalDatum: 'Synthetic BM', hemisphere: 'S', distanceMode: 'grid' } }

it('records explicit entry/exit lengths on the middle PI and keeps blank lengths unknown', async () => {
  const save = jest.fn<void, [IntersectionPoint[]]>()
  render(<Step2Horizontal data={data} onSave={save} />)
  fireEvent.click(screen.getByLabelText('Use transition spirals at PI 2'))
  fireEvent.click(screen.getByRole('button', { name: 'Save IPs' }))
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent(/length/i)
  fireEvent.change(screen.getByLabelText('Entry spiral length at PI 2 (m)'), { target: { value: '60' } })
  fireEvent.change(screen.getByLabelText('Exit spiral length at PI 2 (m)'), { target: { value: '60' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save IPs' }))
  await waitFor(() => expect(save).toHaveBeenCalled())
  expect(save.mock.calls[0][0][1]).toMatchObject({ hasTransition: true, transitionLengthIn: 60, transitionLengthOut: 60 })
  expect(screen.queryByLabelText('Use transition spirals at PI 1')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Use transition spirals at PI 3')).not.toBeInTheDocument()
})

it('keeps unsupported asymmetric lengths visible and blocks an accidental approximation', () => {
  const save = jest.fn(), ips = data.ips.map((p, i) => i === 1 ? { ...p, hasTransition: true, transitionLengthIn: 60, transitionLengthOut: 70 } : p)
  render(<Step2Horizontal data={{ ...data, ips }} onSave={save} />)
  expect(screen.getByLabelText('Exit spiral length at PI 2 (m)')).toHaveValue(70)
  fireEvent.click(screen.getByRole('button', { name: 'Save IPs' }))
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent(/equal|symmetric/i)
})

it('shows transition junctions in project outputs with their correct names', () => {
  const ips = data.ips.map((p, i) => i === 1 ? { ...p, hasTransition: true, transitionLengthIn: 60, transitionLengthOut: 60 } : p)
  render(<Step6Outputs data={{ ...data, ips }} project={project} />)
  expect(screen.getByRole('table', { name: 'Horizontal alignment curves' })).toHaveTextContent('spiral-circular-spiral')
  for (const header of ['TS chainage m', 'SC chainage m', 'CS chainage m', 'ST chainage m']) expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument()
})

it('retains entered transition values and reports a rejected save', async () => {
  const save = jest.fn().mockResolvedValue(false)
  const ips = data.ips.map((p, i) => i === 1 ? { ...p, hasTransition: true, transitionLengthIn: 60, transitionLengthOut: 60 } : p)
  render(<Step2Horizontal data={{ ...data, ips }} onSave={save} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save IPs' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not be saved/i))
  expect(screen.getByLabelText('Entry spiral length at PI 2 (m)')).toHaveValue(60)
})
