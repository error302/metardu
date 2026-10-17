import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FieldbookProjectPanel } from './FieldbookProjectPanel'

function props() {
  return { projectId: 'road', projects: [{ id: 'road', name: 'Access road' }, { id: 'bridge', name: 'Bridge control' }], projectsError: null,
    name: 'Morning run', onNameChange: jest.fn(), onProjectChange: jest.fn(async () => {}), saving: false,
    onSave: jest.fn(async () => true), status: null, error: false,
    savedBooks: [{ id: 'saved', name: 'Previous run', type: 'leveling' as const, data: {} }], activeBookId: null,
    onOpen: jest.fn(), onExportJSON: jest.fn(), onExportCSV: jest.fn(async () => {}), onExportPDF: jest.fn(async () => {}) }
}
it('exposes project and book controls and changes the selected project', async () => {
  const input = props(); render(<FieldbookProjectPanel {...input} />)
  expect(screen.getByRole('textbox', { name: 'Book name' })).toHaveValue('Morning run')
  fireEvent.change(screen.getByLabelText('Fieldbook project'), { target: { value: 'bridge' } })
  await waitFor(() => expect(input.onProjectChange).toHaveBeenCalledWith('bridge'))
})
it('retains the open book when saving before opening fails', async () => {
  const input = props(); input.onSave.mockResolvedValue(false)
  render(<FieldbookProjectPanel {...input} />)
  fireEvent.change(screen.getByLabelText('Open saved fieldbook'), { target: { value: 'saved' } })
  await waitFor(() => expect(input.onSave).toHaveBeenCalled())
  expect(input.onOpen).not.toHaveBeenCalled()
})
it('reports an export failure and permits retry', async () => {
  const input = props(); input.onExportCSV.mockRejectedValueOnce(new Error('Download could not be created'))
  render(<FieldbookProjectPanel {...input} />)
  fireEvent.click(screen.getByText('Files & saved books'))
  fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Download could not be created')
  fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
  await waitFor(() => expect(input.onExportCSV).toHaveBeenCalledTimes(2))
})
it('disables saving until a project is selected', () => {
  render(<FieldbookProjectPanel {...props()} projectId="" />)
  expect(screen.getByRole('button', { name: 'Save fieldbook' })).toBeDisabled()
})
