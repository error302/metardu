import type { BrowserClient } from '@/lib/api-client/client'
import type { EngineeringData } from '@/types/engineering'
import { saveProjectEngineeringData } from '../projectEngineeringPersistence'

function fakeClient(result: {
  data: unknown
  error: { message: string } | null
}) {
  const builder = { eq: jest.fn(), is: jest.fn(), then: Promise.resolve(result).then.bind(Promise.resolve(result)) }
  const eq = builder.eq.mockReturnValue(builder)
  const is = builder.is.mockReturnValue(builder)
  const update = jest.fn().mockReturnValue({ eq })
  const from = jest.fn().mockReturnValue({ update })
  return {
    client: { from } as unknown as Pick<BrowserClient, 'from'>,
    from,
    update,
    eq,
    is,
  }
}

const engineeringData: EngineeringData = {
  mode: 'drainage',
  standard: 'KRDM2017',
  drainage: { manholes: [] },
}

describe('saveProjectEngineeringData', () => {
  it('writes the current engineering data to the selected project', async () => {
    const mock = fakeClient({
      data: [{ id: 'project-1', engineering_data: engineeringData }],
      error: null,
    })

    await expect(
      saveProjectEngineeringData(mock.client, 'project-1', engineeringData, null),
    ).resolves.toBeUndefined()
    expect(mock.from).toHaveBeenCalledWith('projects')
    expect(mock.update).toHaveBeenCalledWith({
      engineering_data: engineeringData,
    })
    expect(mock.eq).toHaveBeenCalledWith('id', 'project-1')
    expect(mock.is).toHaveBeenCalledWith('engineering_data', null)
  })

  it('rejects result-shaped database failures instead of reporting a successful save', async () => {
    const mock = fakeClient({
      data: null,
      error: { message: 'permission denied' },
    })

    await expect(
      saveProjectEngineeringData(mock.client, 'project-1', engineeringData, null),
    ).rejects.toThrow('Engineering data was not saved: permission denied')
  })

  it('rejects a filtered-out update even when the database proxy reports no SQL error', async () => {
    const mock = fakeClient({ data: [], error: null })

    await expect(
      saveProjectEngineeringData(mock.client, 'project-1', engineeringData, null),
    ).rejects.toThrow(/project was not updated/i)
  })
  it.each([
    { id: 'another-project', engineering_data: engineeringData },
    { id: 'project-1', engineering_data: { ...engineeringData, mode: 'road' } },
    { id: 'project-1' },
  ])(
    'refuses a returned row that does not acknowledge the exact project and design (%j)',
    async (row) => {
      const mock = fakeClient({ data: [row], error: null })
      await expect(
        saveProjectEngineeringData(mock.client, 'project-1', engineeringData, null),
      ).rejects.toThrow(/acknowledge/i)
    },
  )
})

it('compares the exact originally loaded snapshot instead of the edited replacement', async () => {
  const prior:EngineeringData = { ...engineeringData, standard:'KeRRA' }
  const mock = fakeClient({ data: [{id:'project-1',engineering_data:engineeringData}],error:null })
  await saveProjectEngineeringData(mock.client,'project-1',engineeringData,prior)
  expect(mock.eq).toHaveBeenCalledWith('engineering_data',prior)
  expect(mock.is).not.toHaveBeenCalled()
})
it.each([undefined, {...engineeringData,invalid:Infinity}])('refuses a missing or non-finite prior snapshot before any query (%j)', async prior => {
  const mock=fakeClient({data:[],error:null})
  await expect(saveProjectEngineeringData(mock.client,'project-1',engineeringData,prior as EngineeringData|null)).rejects.toThrow(/snapshot/i)
  expect(mock.from).not.toHaveBeenCalled()
})
it('refuses non-finite proposed input before JSON can coerce it to null',async()=>{
  const mock=fakeClient({data:[],error:null})
  await expect(saveProjectEngineeringData(mock.client,'project-1',{...engineeringData,drainage:{manholes:[{coverLevel:Infinity}]}} as EngineeringData,null)).rejects.toThrow(/finite|JSON/i)
  expect(mock.from).not.toHaveBeenCalled()
})
