import { render, screen } from '@testing-library/react'
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
