import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LegacyDeviceRecovery } from './LegacyDeviceRecovery'
import { listLegacyWork, selectLegacyWork, reviewLegacyWork } from '@/lib/mobile/recoveryService'
jest.mock('@/lib/mobile/recoveryService',()=>({listLegacyWork:jest.fn(),selectLegacyWork:jest.fn(),reviewLegacyWork:jest.fn()}))
const props={actorId:'owner',projectId:'project'}
beforeEach(()=>{
  jest.resetAllMocks()
  jest.mocked(listLegacyWork).mockResolvedValue({items:[{id:'legacy',recordId:'P1',name:'P1',type:'field_observation',status:'failed',canQueue:true}],next:null})
  jest.mocked(selectLegacyWork).mockResolvedValue({item:{id:'legacy',recordId:'P1',type:'field_observation',action:'create',data:{id:'P1',projectId:'project',pointName:'P1',timestamp:Date.parse('2026-10-20T08:00:00Z'),easting:0,northing:10}},sourceHash:'a'.repeat(64)})
  jest.mocked(reviewLegacyWork).mockResolvedValue({message:'Raw delivery confirmed. Capture author remains unknown.'})
})
test('the closed recovery control does not read private device work',()=>{
  render(<LegacyDeviceRecovery {...props}/>)
  expect(screen.getByRole('button',{name:'Recover older device work'})).toBeInTheDocument()
  expect(listLegacyWork).not.toHaveBeenCalled()
})

test('a failed recovery inventory can be retried without submitting a review or adopting any source',async()=>{
  jest.mocked(listLegacyWork).mockRejectedValueOnce(new Error('Connect and sign in before reviewing older device work.'))
    .mockResolvedValueOnce({items:[],next:null})
  render(<LegacyDeviceRecovery {...props}/>)
  fireEvent.click(screen.getByRole('button',{name:'Recover older device work'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Connect and sign in')
  fireEvent.click(screen.getByRole('button',{name:'Retry recovery'}))
  expect(await screen.findByText('No older unattributed queue entries were found for this project.')).toBeInTheDocument()
  expect(listLegacyWork).toHaveBeenCalledTimes(2)
  expect(reviewLegacyWork).not.toHaveBeenCalled()
  expect(selectLegacyWork).not.toHaveBeenCalled()
})
test('recovery requires an individual source review and explicit unknown-author acknowledgement',async()=>{
  render(<LegacyDeviceRecovery {...props}/>)
  fireEvent.click(screen.getByRole('button',{name:'Recover older device work'}))
  fireEvent.click(await screen.findByRole('button',{name:'Inspect P1'}))
  const submit=await screen.findByRole('button',{name:'Review and attempt raw delivery'})
  expect(submit).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox',{name:/capture author is unknown/i}))
  fireEvent.click(submit)
  await waitFor(()=>expect(reviewLegacyWork).toHaveBeenCalledTimes(1))
  expect(await screen.findByRole('status')).toHaveTextContent('Capture author remains unknown')
})
