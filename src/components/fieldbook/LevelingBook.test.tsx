import { render, screen, within } from '@testing-library/react'
import { LevelingBook } from './LevelingBook'
import { riseAndFall } from '@/lib/engine/leveling'

test('unknown run length and closing RL are displayed as unevaluated rather than NaN or zero tolerance',()=>{
  render(<LevelingBook t={key=>key} openingRL="100" closingRL="" distanceKm="" levelMethod="rise_and_fall"
    setOpeningRL={jest.fn()} setClosingRL={jest.fn()} setDistanceKm={jest.fn()} setLevelMethod={jest.fn()} levelRows={[]} setLevelRows={jest.fn()}
    computed={{ok:true,calc:riseAndFall({readings:[],openingRL:100,method:'rise_and_fall'})}} />)
  expect(screen.queryByText(/NaN|Â±0\.0000/)).not.toBeInTheDocument()
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
  // Header + BM + TP1 — and BM keeps the opening RL while TP1 carries its own
  // computed RL (the synthetic opening row is not rendered as a survey row).
  expect(renderedRows).toHaveLength(3)
  expect(within(renderedRows[1]).getByText('100.0000')).toBeInTheDocument()
  expect(within(renderedRows[2]).getByText('100.2500')).toBeInTheDocument()
})

test('a backsight alone cannot appear as a measured zero closure or arithmetic pass', () => {
  render(<LevelingBook t={key => key} openingRL="100" closingRL="100" distanceKm="1" levelMethod="rise_and_fall"
    setOpeningRL={jest.fn()} setClosingRL={jest.fn()} setDistanceKm={jest.fn()} setLevelMethod={jest.fn()}
    levelRows={[{ id: 'bm', station: 'BM', bs: '0.0000', is: '', fs: '', remarks: '' }]} setLevelRows={jest.fn()}
    computed={{ ok: true, calc: riseAndFall({ readings: [{ station: 'BM', bs: 0 }], openingRL: 100, closingRL: 100, distanceKm: 1, method: 'rise_and_fall' }) }} />)
  expect(screen.queryByText('common.pass')).not.toBeInTheDocument()
  expect(screen.queryByText('0.0000 m')).not.toBeInTheDocument()
  expect(screen.getAllByText('Forward sight required')).toHaveLength(2)
})

test('rejecting a row requires a reason, strikes it through, and keeps it in the audit trail', () => {
  const rows = [
    { id: 'r1', station: 'BM', bs: '1.5000', is: '', fs: '', remarks: '' },
    { id: 'r2', station: 'TP1', bs: '', is: '', fs: '1.2500', remarks: '', rejected: true, rejectedReason: 'staff not on same point' },
  ]
  const setLevelRows = jest.fn()
  render(<LevelingBook t={key => key} openingRL="100" closingRL="100.25" distanceKm="1" levelMethod="rise_and_fall"
    setOpeningRL={jest.fn()} setClosingRL={jest.fn()} setDistanceKm={jest.fn()} setLevelMethod={jest.fn()}
    levelRows={rows} setLevelRows={setLevelRows}
    computed={{ ok: true, calc: riseAndFall({ readings: [{ station: 'BM', bs: 1.5 }, { station: 'TP1', fs: 1.25 }], openingRL: 100, closingRL: 100.25, distanceKm: 1, method: 'rise_and_fall' }) }}
    audit={[{ id: 'a1', rowId: 'r2', at: '2026-11-18T09:00:00Z', by: 'surveyor', action: 'rejected', reason: 'staff not on same point' }]}
    onReject={jest.fn()} onRestore={jest.fn()} signOff={null} onSignOff={jest.fn()} />)
  // Rejected row renders struck-through with no computed values
  const rejectedRow = screen.getAllByRole('row').find(row => row.getAttribute('data-rejected') === 'true')
  expect(rejectedRow).toBeDefined()
  if (!rejectedRow) throw new Error('rejected leveling row was not rendered')
  expect(within(rejectedRow).getAllByText('—').length).toBeGreaterThan(0)
  // Audit trail is visible with the rejection reason
  expect(screen.getByText(/staff not on same point/)).toBeInTheDocument()
  // Restore button is offered instead of delete; no delete button exists
  expect(within(rejectedRow).getByText('common.restore')).toBeInTheDocument()
  expect(screen.queryByText('common.remove')).not.toBeInTheDocument()
})
