import {fireEvent,render,screen} from '@testing-library/react'
import Page from './page'

const observed={label:'Synthetic epoch',epoch:2026,monuments:[{monumentId:'DM-1',latitude:-1,longitude:37,height:100,frame:'ITRF2014',epoch:2026}]}
function enterEpochs(){
  fireEvent.change(screen.getByLabelText('Baseline epoch observations (JSON)'),{target:{value:JSON.stringify(observed)}})
  fireEvent.change(screen.getByLabelText('Current epoch observations (JSON)'),{target:{value:JSON.stringify(observed)}})
}
test('requires declared project tolerances rather than silently choosing dam limits',()=>{
  render(<Page />)
  enterEpochs()
  fireEvent.click(screen.getByRole('button',{name:'Compare Epochs'}))
  expect(screen.getByRole('alert')).toHaveTextContent(/tolerances/i)
  expect(screen.queryByText('STABLE')).not.toBeInTheDocument()
})
test('shows missing uncertainty as not assessed rather than a passed significance test',()=>{
  render(<Page />)
  enterEpochs()
  fireEvent.change(screen.getByLabelText('Tolerance H (m)'),{target:{value:'0.005'}})
  fireEvent.change(screen.getByLabelText('Tolerance V (m)'),{target:{value:'0.003'}})
  fireEvent.click(screen.getByRole('button',{name:'Compare Epochs'}))
  expect(screen.getByText('INCONCLUSIVE')).toBeInTheDocument()
  expect(screen.getByText('Not assessed')).toBeInTheDocument()
  expect(screen.queryByText('✓ no')).not.toBeInTheDocument()
})
