import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProjectReferenceSystemPanel from './ProjectReferenceSystemPanel'
import { buildProjectReferenceSystem } from '@/lib/spatial/projectReferenceSystem'

const props = { projectId: 'synthetic-project', datum: 'WGS84', utmZone: 37, hemisphere: 'S' as const }
const record = (name = 'SYNTHETIC BM') => ({ prs: buildProjectReferenceSystem({ datum: 'WGS84', utmZone: 37, hemisphere: 'S', verticalDatum: name }) })
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response
const originalFetch = global.fetch
let fetchMock: jest.Mock
beforeEach(() => { fetchMock = jest.fn().mockResolvedValue(response({ referenceSystem: null })); global.fetch = fetchMock as typeof fetch })
afterEach(() => { global.fetch = originalFetch })
async function ready() { render(<ProjectReferenceSystemPanel {...props} />); await screen.findByRole('button', { name: 'Declare Reference System' }) }

it('requires an explicit ellipsoidal height before computing a combined factor', async () => {
  await ready()
  fireEvent.change(screen.getByLabelText('Reference Point Easting (m)'), { target: { value: '500000' } })
  fireEvent.change(screen.getByLabelText('Reference Point Northing (m)'), { target: { value: '9800000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Compute at Point' }))
  expect(screen.getByLabelText(/Combined Scale Factor/)).toHaveValue('')
  expect(screen.getByText(/height.*required|enter.*ellipsoidal height/i)).toBeInTheDocument()
})
it('preserves a supplied zero ellipsoidal height in a computation and save request', async () => {
  await ready()
  fireEvent.change(screen.getByLabelText('Reference Point Easting (m)'), { target: { value: '500000' } })
  fireEvent.change(screen.getByLabelText('Reference Point Northing (m)'), { target: { value: '9800000' } })
  fireEvent.change(screen.getByLabelText(/Reference.*Height/i), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Compute at Point' }))
  expect(screen.getByLabelText(/Combined Scale Factor/)).not.toHaveValue('')
  fetchMock.mockResolvedValueOnce(response({ referenceSystem: record() }))
  fireEvent.click(screen.getByRole('button', { name: 'Declare Reference System' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  const [,options] = fetchMock.mock.calls[1] as [string, RequestInit]
  expect(JSON.parse(String(options.body))).toMatchObject({ csfReference: { easting: 500000, northing: 9800000, height: 0 } })
})
it('does not silently drop a partially entered reference point', async () => {
  await ready()
  fireEvent.change(screen.getByLabelText('Reference Point Easting (m)'), { target: { value: '500000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Declare Reference System' }))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(screen.getByText(/easting and northing|northing.*required/i)).toBeInTheDocument()
})
it('retains entries and enables recovery after a rejected network save', async () => {
  await ready()
  fireEvent.change(screen.getByLabelText(/Reference System Notes/), { target: { value: 'Retain this synthetic field reference' } })
  fetchMock.mockRejectedValueOnce(new Error('Synthetic network disconnected'))
  fireEvent.click(screen.getByRole('button', { name: 'Declare Reference System' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Declare Reference System' })).toBeEnabled())
  expect(screen.getByText(/not confirmed|network.*unavailable|could not save/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/Reference System Notes/)).toHaveValue('Retain this synthetic field reference')
})
it('does not claim successful declaration from malformed HTTP 200 data', async () => {
  await ready(); fetchMock.mockResolvedValueOnce(response({}))
  fireEvent.click(screen.getByRole('button', { name: 'Declare Reference System' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Declare Reference System' })).toBeEnabled())
  expect(screen.queryByText('Project reference system declared and saved.')).not.toBeInTheDocument()
  expect(screen.getByText(/not confirmed|invalid.*response|could not confirm/i)).toBeInTheDocument()
})
it('shows failed loading as unknown and offers a retry instead of claiming undeclared', async () => {
  fetchMock.mockResolvedValueOnce(response({ error: 'Synthetic unavailable' }, 503))
  render(<ProjectReferenceSystemPanel {...props} />)
  expect(await screen.findByRole('button', { name: /Retry.*reference/i })).toBeInTheDocument()
  expect(screen.getByText('Status unavailable')).toBeInTheDocument()
  expect(screen.queryByText(/This project has no declared reference system yet/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Declare Reference System' })).toBeDisabled()
})
it('does not hydrate project B with a late response for project A', async () => {
  let finishA: (response: Response) => void = () => { throw new Error('A request was not started') }
  fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finishA = resolve }))
  const view = render(<ProjectReferenceSystemPanel {...props} projectId="project-A" />)
  fetchMock.mockResolvedValueOnce(response({ referenceSystem: record('SYNTHETIC B') }))
  view.rerender(<ProjectReferenceSystemPanel {...props} projectId="project-B" />)
  await waitFor(() => expect(screen.getByLabelText(/Vertical Datum/)).toHaveValue('SYNTHETIC B'))
  await act(async () => { finishA(response({ referenceSystem: record('SYNTHETIC A') })) })
  expect(screen.getByLabelText(/Vertical Datum/)).toHaveValue('SYNTHETIC B')
})

it.each(['Reference Point Easting (m)', 'Reference Point Northing (m)', 'Reference Ellipsoidal Height (m)'])('invalidates the computed factor after editing %s', async label => {
  await ready()
  fireEvent.change(screen.getByLabelText('Reference Point Easting (m)'), { target: { value: '500000' } })
  fireEvent.change(screen.getByLabelText('Reference Point Northing (m)'), { target: { value: '9800000' } })
  fireEvent.change(screen.getByLabelText(/Reference.*Height/i), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Compute at Point' }))
  expect(screen.getByLabelText(/Combined Scale Factor/)).not.toHaveValue('')
  fireEvent.change(screen.getByLabelText(label), { target: { value: '1' } })
  expect(screen.getByLabelText(/Combined Scale Factor/)).toHaveValue('')
  expect(screen.getByLabelText('Factor Provenance')).toHaveValue('')
})
