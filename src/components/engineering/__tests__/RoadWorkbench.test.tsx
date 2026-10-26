import { render, screen, fireEvent } from '@testing-library/react'
import RoadWorkbench from '../RoadWorkbench'
import type { RoadDesignData } from '@/types/engineering'
jest.mock('../RoadWorkbench3D', () => ({
  __esModule: true,
  default: ({ chainage }: { chainage: number }) => (
    <div aria-label="Road 3D view">3D selected {chainage}</div>
  ),
}))
const road: RoadDesignData = {
  roadName: 'SYNTHETIC linked road',
  startChainage: 0,
  datum: 'Declared',
  coordinateSystem: 'EPSG:32737',
  designSpeed: 40,
  roadClass: 'C',
  ips: [
    { id: 'a', name: 'Start', easting: 500000, northing: 9500000, radius: 0 },
    { id: 'b', name: 'End', easting: 500000, northing: 9500020, radius: 0 },
  ],
  vips: [
    { id: 'v1', chainage: 0, reducedLevel: -1 },
    { id: 'v2', chainage: 20, reducedLevel: -1 },
  ],
  crossSectionTemplate: {
    carriagewayWidth: 6,
    shoulderWidth: 0,
    camber: 0,
    subgradeDepth: 0,
    cutSlope: '1:1',
    fillSlope: '1:1',
  },
  stations: [0, 20].map((chainage) => ({
    chainage,
    groundLevel: 0,
    designLevelSource: 'vertical-alignment',
    groundProfile: [
      { offset: -10, level: 0 },
      { offset: 0, level: 0 },
      { offset: 10, level: 0 },
    ],
  })),
}
const otherFixtureCrs = 'EPSG:21037'
const reference = {
  code: 'EPSG:32737',
  verticalDatum: 'SYNTHETIC BM',
  distanceMode: 'grid' as const,
}
it('connects plan, profile, section and 3D to one selected chainage and actual quantities', () => {
  render(
    <RoadWorkbench
      projectId="synthetic-project"
      road={road}
      reference={reference}
    />,
  )
  for (const name of [
    'Plan view',
    'Longitudinal profile',
    'Cross-section',
    'Road 3D view',
  ])
    expect(screen.getByLabelText(name)).toBeInTheDocument()
  expect(screen.getByLabelText('Draft cut volume')).toHaveTextContent('140.000')
  fireEvent.change(screen.getByLabelText('Selected chainage (m)'), {
    target: { value: '20' },
  })
  expect(screen.getByText('3D selected 20')).toBeInTheDocument()
  expect(screen.getByLabelText('Selected northing')).toHaveTextContent(
    '9500020.000',
  )
  expect(screen.getByLabelText('Selected cut area')).toHaveTextContent('7.000')
})
it('shows missing ground at an intermediate selected chainage without inventing section areas', () => {
  render(
    <RoadWorkbench
      projectId="synthetic-project"
      road={road}
      reference={reference}
    />,
  )
  fireEvent.change(screen.getByLabelText('Selected chainage (m)'), {
    target: { value: '10' },
  })
  expect(
    screen.getByText(/No measured ground section exists/),
  ).toBeInTheDocument()
  expect(screen.getByLabelText('Selected cut area')).toHaveTextContent(
    'Unassessed',
  )
  expect(screen.getByLabelText('Selected target level')).toHaveTextContent(
    '-1.000',
  )
})
it('offers accessible focused views and links to the saved-project input and delivery workflows', () => {
  render(
    <RoadWorkbench
      projectId="synthetic-project"
      road={road}
      reference={reference}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Profile only' }))
  expect(screen.getByLabelText('Longitudinal profile')).toBeInTheDocument()
  expect(screen.queryByLabelText('Plan view')).not.toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Edit alignment inputs' }),
  ).toHaveAttribute(
    'href',
    '/project/synthetic-project/engineering?tab=workflow&step=horizontal',
  )
  expect(
    screen.getByRole('link', { name: 'Open delivery schedules' }),
  ).toHaveAttribute(
    'href',
    '/project/synthetic-project/engineering?tab=workflow&step=export',
  )
})
it('invalidates all old source geometry when the current project reference no longer matches', () => {
  const view = render(
    <RoadWorkbench
      projectId="synthetic-project"
      road={road}
      reference={reference}
    />,
  )
  view.rerender(
    <RoadWorkbench
      projectId="synthetic-project"
      road={road}
      reference={{ ...reference, code: otherFixtureCrs }}
    />,
  )
  expect(screen.queryByLabelText('Road 3D view')).not.toBeInTheDocument()
  expect(screen.getByText(/road CRS must match/i)).toBeInTheDocument()
  expect(screen.getByLabelText('Draft cut volume')).toHaveTextContent(
    'Unassessed',
  )
})
