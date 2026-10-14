import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Step3Vertical } from '../Step3Vertical'
import { Step5Stations } from '../Step5Stations'

it('does not save blank VIP measurements as zero and retains zero when entered explicitly', async () => {
  const save = jest.fn().mockResolvedValue(true)
  render(<Step3Vertical data={null} onSave={save} />)
  fireEvent.click(screen.getByRole('button', { name: '+ Add VIP' }))
  expect(screen.getByLabelText('VIP 1 chainage')).toHaveValue(null)
  fireEvent.click(screen.getByRole('button', { name: 'Save VIPs' }))
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent(/finite/i)
  fireEvent.change(screen.getByLabelText('VIP 1 chainage'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('VIP 1 rl'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save VIPs' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith([expect.objectContaining({ chainage: 0, reducedLevel: 0, curveLength: undefined, kValue: undefined })], undefined))
})
it('saves an explicit alignment level source without treating a cached manual RL as authoritative', async () => {
  const save = jest.fn().mockResolvedValue(true)
  render(<Step5Stations data={null} onSave={save} />)
  fireEvent.click(screen.getByRole('button', { name: /Add Station/ }))
  fireEvent.change(screen.getByLabelText('Chainage 1'), { target: { value: '100' } })
  fireEvent.change(screen.getByLabelText('Ground RL 1'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Design level source 1'), { target: { value: 'vertical-alignment' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Stations' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith([expect.objectContaining({ chainage: 100, groundLevel: 3, designLevelSource: 'vertical-alignment', designLevel: undefined })]))
})
