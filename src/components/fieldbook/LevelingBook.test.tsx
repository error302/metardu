import { render, screen, within } from '@testing-library/react'
import { LevelingBook } from './LevelingBook'
import { riseAndFall } from '@/lib/engine/leveling'

test('unknown run length and closing RL are displayed as unevaluated rather than NaN or zero tolerance',()=>{
  render(<LevelingBook t={key=>key} openingRL="100" closingRL="" distanceKm="" levelMethod="rise_and_fall"
    setOpeningRL={jest.fn()} setClosingRL={jest.fn()} setDistanceKm={jest.fn()} setLevelMethod={jest.fn()} levelRows={[]} setLevelRows={jest.fn()}
    computed={{ok:true,calc:riseAndFall({readings:[],openingRL:100,method:'rise_and_fall'})}} />)
  expect(screen.getByText('Run length required')).toBeInTheDocument()
  expect(screen.getByText('Closing RL required')).toBeInTheDocument()
  expect(screen.queryByText(/NaN|±0\.0000/)).not.toBeInTheDocument()
})

test('a real station named BM retains its own computed RL without shifting subsequent rows', () => {
  const rows = [
    { id: 'bm', station: 'BM', bs: '1.5000', is: '', fs: '', remarks: '' },
    { id: 'tp', station: 'TP1', bs: '', is: '', fs: '1.2500', remarks: '' },
  ]
  render(<LevelingBook t={key => key} openingRL="100" closingRL="" distanceKm="" levelMethod="rise_and_fall"
    setOpeningRL={jest.fn()} setClosingRL={jest.fn()} setDistanceKm={jest.fn()} setLevelMethod={jest.fn()} levelRows={rows} setLevelRows={jest.fn()}
    computed={{ ok: true, calc: riseAndFall({ readings: [{ station: 'BM', bs: 1.5 }, { station: 'TP1', fs: 1.25 }], openingRL: 100, method: 'rise_and_fall' }) }} />)
  const renderedRows = screen.getAllByRole('row')
  expect(within(renderedRows[1]).getByText('100.0000')).toBeInTheDocument()
  expect(within(renderedRows[2]).getByText('100.2500')).toBeInTheDocument()
})
