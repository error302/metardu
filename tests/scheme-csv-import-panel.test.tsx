import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createHash } from 'node:crypto'
import CsvImportPanel from '@/components/scheme/CsvImportPanel'

const PROJECT='11111111-1111-4111-8111-111111111111', BLOCK='22222222-2222-4222-8222-222222222222'
const csv='parcel_number,lr_number_proposed,area_ha,notes\nSYN-1,,0.125,SYNTHETIC ONLY'
const originalFetch=global.fetch
const fetchMock=jest.fn<Promise<{ok:boolean;json:()=>Promise<unknown>}>,[string,RequestInit]>()
beforeEach(()=>{fetchMock.mockReset();global.fetch=fetchMock as unknown as typeof fetch})
afterEach(()=>{global.fetch=originalFetch})
function file(text=csv){const value=new File([text],'SYNTHETIC.csv',{type:'text/csv'});Object.defineProperty(value,'arrayBuffer',{value:async()=>Uint8Array.from(new TextEncoder().encode(text)).buffer});return value}
function choose(text=csv){fireEvent.change(screen.getByLabelText('Choose parcel metadata CSV'),{target:{files:[file(text)]}})}
function reply(form:FormData,overrides:Record<string,unknown>={}){return {ok:true,json:async()=>({data:{protocol:'scheme-metadata-import-v1',requestId:form.get('request_id'),projectId:PROJECT,blockId:BLOCK,sourceFileHash:createHash('sha256').update(csv).digest('hex'),sourceFileName:'SYNTHETIC.csv',total_rows:1,created:1,unchanged:0,skipped:0,errors:[],fieldVerified:false,replayed:false,...overrides}})}}
async function confirm(){await screen.findByText('1 parcel ready for review');fireEvent.click(screen.getByLabelText(/I reviewed this metadata/));fireEvent.click(screen.getByRole('button',{name:'Confirm parcel import'}))}

it('previews the file without sending a mutation until review and confirmation',async()=>{
  render(<CsvImportPanel projectId={PROJECT} blockId={BLOCK} blockName="Synthetic"/>);choose();await screen.findByText('1 parcel ready for review');expect(fetchMock).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Confirm parcel import'})).toBeDisabled();expect(screen.getByText('SYNTHETIC ONLY')).toBeInTheDocument()
})
it('rejects malformed rows before uploading',async()=>{render(<CsvImportPanel projectId={PROJECT} blockId={BLOCK} blockName="Synthetic"/>);choose(csv.replace('0.125','0junk'));await screen.findByRole('alert');expect(fetchMock).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Confirm parcel import'})).not.toBeInTheDocument()})
it('accepts only the matching, complete server receipt',async()=>{
  fetchMock.mockImplementation(async(_url:string,init:RequestInit)=>reply(init.body as FormData));const refreshed=jest.fn();render(<CsvImportPanel projectId={PROJECT} blockId={BLOCK} blockName="Synthetic" onImportComplete={refreshed}/>);choose();await confirm();await screen.findByText('Import receipt confirmed');expect(refreshed).toHaveBeenCalledTimes(1)
})
it('keeps the exact request identity after a lost response',async()=>{
  fetchMock.mockRejectedValueOnce(new Error('Connection lost')).mockImplementation(async(_url:string,init:RequestInit)=>reply(init.body as FormData,{replayed:true}));render(<CsvImportPanel projectId={PROJECT} blockId={BLOCK} blockName="Synthetic"/>);choose();await confirm();await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Retry same import'}));await screen.findByText('Import receipt recovered');expect((fetchMock.mock.calls[0][1].body as FormData).get('request_id')).toBe((fetchMock.mock.calls[1][1].body as FormData).get('request_id'))
})
it.each([{projectId:'33333333-3333-4333-8333-333333333333'},{sourceFileHash:'a'.repeat(64)},{created:0},{fieldVerified:true}])('refuses a mismatched or incomplete acknowledgement %j',async(overrides)=>{
  fetchMock.mockImplementation(async(_url:string,init:RequestInit)=>reply(init.body as FormData,overrides));const refreshed=jest.fn();render(<CsvImportPanel projectId={PROJECT} blockId={BLOCK} blockName="Synthetic" onImportComplete={refreshed}/>);choose();await confirm();await screen.findByRole('alert');expect(screen.queryByText('Import receipt confirmed')).not.toBeInTheDocument();expect(refreshed).not.toHaveBeenCalled()
})
it('ignores a response from a different project after navigation',async()=>{
  let finish:((response:ReturnType<typeof reply>)=>void)|undefined
  fetchMock.mockImplementation(()=>new Promise<ReturnType<typeof reply>>(resolve=>{finish=response=>resolve(response)}));const refreshed=jest.fn();const view=render(<CsvImportPanel projectId={PROJECT} blockId={BLOCK} blockName="Synthetic" onImportComplete={refreshed}/>);choose();await confirm();await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(1));const form=fetchMock.mock.calls[0][1].body as FormData
  view.rerender(<CsvImportPanel projectId="33333333-3333-4333-8333-333333333333" blockId={BLOCK} blockName="Other" onImportComplete={refreshed}/>);finish?.(reply(form));await waitFor(()=>expect(screen.queryByText('1 parcel ready for review')).not.toBeInTheDocument());expect(refreshed).not.toHaveBeenCalled();expect(screen.queryByText('Import receipt confirmed')).not.toBeInTheDocument()
})
