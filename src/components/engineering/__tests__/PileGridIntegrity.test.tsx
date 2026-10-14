import { fireEvent, render, screen, within } from '@testing-library/react'
import PileGridPanel from '../PileGridPanel'
const fixtureCrs = 'EPSG:32737'

it('starts without fabricated survey coordinates, levels or instrument height', () => {
  render(<PileGridPanel />)
  expect(screen.getByLabelText('Origineasting')).toHaveValue(null)
  expect(screen.getByLabelText('Originnorthing')).toHaveValue(null)
  expect(screen.getByLabelText('Originrl')).toHaveValue(null)
  fireEvent.click(screen.getByRole('button',{name:'Generate Grid'}))
  expect(screen.getByRole('alert')).toHaveTextContent(/complete|finite|required/i)
  expect(screen.queryByRole('button',{name:'Export DXF'})).not.toBeInTheDocument()
})
it('invalidates an old computed grid on any source change', () => {
  render(<PileGridPanel />)
  fireEvent.click(screen.getByRole('button',{name:'Load Demo Data'}))
  expect(screen.getByRole('button',{name:'Export DXF'})).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Origineasting'),{target:{value:'500001'}})
  expect(screen.queryByRole('button',{name:'Export DXF'})).not.toBeInTheDocument()
})

it('shows separate height quantities and invalidates the instrument book when setup changes', () => {
  render(<PileGridPanel />)
  fireEvent.click(screen.getByRole('button',{name:'Load Demo Data'}))
  const inputs:Record<string,string>={'Station easting (m)':'499997','Station northing (m)':'9799996','Station RL (m)':'101','Height of instrument (m)':'1.5','Backsight easting (m)':'499997','Backsight northing (m)':'9800006','Prism height (m)':'2'}
  for(const [label,value] of Object.entries(inputs))fireEvent.change(screen.getByLabelText(label),{target:{value}})
  fireEvent.click(screen.getByRole('button',{name:'Compute Setting-Out Data'}))
  const row=within(screen.getByRole('table',{name:'Instrument target schedule'})).getAllByRole('row')[1]
  expect(within(row).getByText('-2.5000')).toBeInTheDocument()
  expect(within(row).getByText('2.5000')).toBeInTheDocument()
  expect(within(row).getByText('-0.5000')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Export instrument CSV'})).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Height of instrument (m)'),{target:{value:'2'}})
  expect(screen.queryByRole('button',{name:'Export instrument CSV'})).not.toBeInTheDocument()
})

it('reloads supplied project values including zero RL without generating or saving them', async () => {
  const original=global.fetch
  const mock=jest.fn().mockResolvedValue({ok:true,json:async()=>({data:{definitions:[{id:'grid-1',name:'Saved approved draft',structure_type:'pile',crs:fixtureCrs,origin_easting:'500000.12345678',origin_northing:'9800000',origin_rl:'0',rows:2,columns:3,row_spacing:'5',column_spacing:'6',rotation:'90',start_label:'B2',label_rows_as:'alpha',label_columns_as:'numeric',pile_diameter_mm:null,depth_m:null,revision:4,metadata:{}}]}})})
  global.fetch=mock
  try {
    render(<PileGridPanel projectId="p" crsCode={fixtureCrs} heightReference="Supplied BM"/>)
    fireEvent.click(screen.getByRole('button',{name:'Load project grids'}))
    fireEvent.change(await screen.findByLabelText('Saved project grid'),{target:{value:'grid-1'}})
    expect(screen.getByLabelText('Origineasting')).toHaveValue(500000.12345678)
    expect(screen.getByLabelText('Originrl')).toHaveValue(0)
    expect(screen.getByLabelText('Start label')).toHaveValue('B2')
    expect(screen.getByLabelText('Rows')).toHaveValue(2)
    expect(screen.queryByRole('button',{name:'Export DXF'})).not.toBeInTheDocument()
    expect(mock).toHaveBeenCalledTimes(1)
  } finally {global.fetch=original}
})
