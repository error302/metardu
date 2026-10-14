import React from 'react'
import { render, screen } from '@testing-library/react'
import LongSectionRenderer from '../LongSectionRenderer'
import type { RoadDesignData } from '@/types/engineering'
const data: RoadDesignData = { roadName:'Synthetic', datum:'Declared', coordinateSystem:'EPSG:32737', designSpeed:40, roadClass:'C', ips:[], startChainage:0, vips: [{ id:'a', chainage:0, reducedLevel:0 },{ id:'p', chainage:100, reducedLevel:2, curveLength:100 },{ id:'b', chainage:200, reducedLevel:0 }],
  stations: [{ chainage:100, groundLevel:3, designLevelSource:'vertical-alignment' }], crossSectionTemplate:{ carriagewayWidth:6, shoulderWidth:0, camber:0, cutSlope:'2:1', fillSlope:'1.5:1', subgradeDepth:0.5 } }
it('renders actual parabolic levels, source labels and declared height reference without invented standards or paper scale', () => {
  render(<LongSectionRenderer data={data} projectName="Synthetic" heightReference="Declared BM" />)
  expect(screen.getByRole('img', {name:/evaluated road vertical profile/})).toBeInTheDocument()
  const table = screen.getByRole('table', {name:'Observed and target station levels'})
  expect(table).toHaveTextContent('1.500'); expect(table).toHaveTextContent('1.000'); expect(table).toHaveTextContent('2.000')
  expect(table).toHaveTextContent('vertical-alignment')
  expect(screen.getByText(/Declared height reference/)).toHaveTextContent('Declared BM')
  expect(screen.queryByText(/Arc 1960/)).not.toBeInTheDocument()
})
it('keeps manual target points and unknown design information without fabricating K or a connecting curve', () => {
  const {container} = render(<LongSectionRenderer data={{ ...data, vips:[], stations:[{ chainage:0, groundLevel:0, designLevel:0 }] }} projectName="Synthetic" heightReference={null} />)
  expect(screen.getByText(/Declared height reference/)).toHaveTextContent('Not declared')
  expect(screen.queryByRole('table',{name:'Evaluated vertical curve schedule'})).not.toBeInTheDocument()
  expect(container.querySelectorAll('circle')).toHaveLength(1)
})
