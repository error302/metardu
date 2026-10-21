import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FieldbookArchiveRecovery } from './FieldbookArchiveRecovery'
import { previewBookArchive, restoreBookArchive, listBookArchives, readBookArchive } from '@/lib/offline/bookArchiveRecovery'
jest.mock('@/lib/offline/bookArchiveRecovery', () => ({ BOOK_ARCHIVE_MAX_BYTES: 50 * 1024 * 1024,
  previewBookArchive: jest.fn(), restoreBookArchive: jest.fn(), listBookArchives: jest.fn(), readBookArchive: jest.fn() }))
const actor='11111111-1111-4111-8111-111111111111', project='22222222-2222-4222-8222-222222222222'
const preview={hash:'a'.repeat(64),edits:2,requests:1,legacy:0,unreadable:1}, bytes=new Uint8Array([123,125])
const props=()=>({actorId:actor,projectId:project,onRestored:jest.fn()})
function select(buffer:Promise<ArrayBuffer>=Promise.resolve(bytes.slice().buffer)) {
 const file=new File(['{}'],'retained.json',{type:'application/json'})
 Object.defineProperty(file,'arrayBuffer',{value:()=>buffer})
 fireEvent.change(screen.getByLabelText('Choose device archive'),{target:{files:[file]}})
}
beforeEach(()=>{jest.resetAllMocks();jest.mocked(listBookArchives).mockResolvedValue([]);jest.mocked(previewBookArchive).mockResolvedValue(preview);jest.mocked(restoreBookArchive).mockResolvedValue({...preview,complete:true})})
test('preview requires explicit review before restoring pending work and refreshing inventory',async()=>{
 const input=props();render(<FieldbookArchiveRecovery {...input}/>);select()
 const restore=await screen.findByRole('button',{name:'Restore reviewed archive'})
 expect(restore).toBeDisabled();expect(screen.getByText(/2 edits.*1 requests/)).toBeInTheDocument()
 expect(restoreBookArchive).not.toHaveBeenCalled();expect(input.onRestored).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('checkbox',{name:/I reviewed this archive/}));fireEvent.click(restore)
 await waitFor(()=>expect(restoreBookArchive).toHaveBeenCalledWith(actor,project,bytes,preview.hash))
 expect(await screen.findByRole('status')).toHaveTextContent(/pending|confirmation/i)
 expect(input.onRestored).toHaveBeenCalledTimes(1)
})
test('a failed partial restore remains resumable through review of its retained source',async()=>{
 jest.mocked(restoreBookArchive).mockRejectedValueOnce(new Error('Device storage full'))
 jest.mocked(listBookArchives).mockResolvedValue([{...preview,complete:false}]);jest.mocked(readBookArchive).mockResolvedValue(bytes)
 const input=props();render(<FieldbookArchiveRecovery {...input}/>);select()
 fireEvent.click(await screen.findByRole('checkbox',{name:/I reviewed this archive/}));fireEvent.click(screen.getByRole('button',{name:'Restore reviewed archive'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Device storage full');expect(input.onRestored).not.toHaveBeenCalled()
 fireEvent.click(await screen.findByRole('button',{name:'Review and resume'}))
 await waitFor(()=>expect(readBookArchive).toHaveBeenCalledWith(actor,project,preview.hash))
 await screen.findByRole('button',{name:'Restore reviewed archive'})
 expect(screen.getByRole('button',{name:'Restore reviewed archive'})).toBeDisabled()
 fireEvent.click(screen.getByRole('checkbox',{name:/I reviewed this archive/}));fireEvent.click(screen.getByRole('button',{name:'Restore reviewed archive'}))
 await waitFor(()=>expect(input.onRestored).toHaveBeenCalledTimes(1))
 expect(restoreBookArchive).toHaveBeenCalledTimes(2)
})
test('scope changes discard a file read that finishes for the previous account',async()=>{
 let resolve!:(buffer:ArrayBuffer)=>void
 const pending=new Promise<ArrayBuffer>(done=>{resolve=done}), input=props()
 const view=render(<FieldbookArchiveRecovery {...input}/>);select(pending)
 view.rerender(<FieldbookArchiveRecovery {...input} actorId={project}/>)
 await act(async()=>{resolve(bytes.slice().buffer);await pending})
 expect(previewBookArchive).not.toHaveBeenCalled();expect(restoreBookArchive).not.toHaveBeenCalled()
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
})
test('a late archive list or restore result cannot expose the old project or refresh its new inventory',async()=>{
 let resolve!:(value:typeof preview & {complete:boolean})=>void
 jest.mocked(restoreBookArchive).mockReturnValue(new Promise(done=>{resolve=done}))
 const input=props(),view=render(<FieldbookArchiveRecovery {...input}/>);select()
 fireEvent.click(await screen.findByRole('checkbox',{name:/I reviewed this archive/}));fireEvent.click(screen.getByRole('button',{name:'Restore reviewed archive'}))
 await waitFor(()=>expect(restoreBookArchive).toHaveBeenCalled())
 view.rerender(<FieldbookArchiveRecovery {...input} projectId={actor}/>)
 await act(async()=>{resolve({...preview,complete:true})})
 expect(input.onRestored).not.toHaveBeenCalled();expect(screen.queryByText(preview.hash)).not.toBeInTheDocument()
})
test('download preserves the retained bytes without reserializing JSON',async()=>{
 jest.mocked(listBookArchives).mockResolvedValue([{...preview,complete:false}]);jest.mocked(readBookArchive).mockResolvedValue(bytes)
 const create=jest.fn((_blob:Blob)=> 'blob:synthetic'),revoke=jest.fn()
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke})
 const click=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 render(<FieldbookArchiveRecovery {...props()}/>);fireEvent.click(await screen.findByRole('button',{name:'Download original archive'}))
 await waitFor(()=>expect(click).toHaveBeenCalled())
 expect(create.mock.calls[0]).toHaveLength(1);expect(create.mock.calls[0][0]).toBeInstanceOf(Blob)
 expect((create.mock.calls[0][0] as Blob).size).toBe(bytes.length)
 expect(readBookArchive).toHaveBeenCalledWith(actor,project,preview.hash)
 expect(restoreBookArchive).not.toHaveBeenCalled();click.mockRestore()
})

test('verified source bytes remain downloadable when restore metadata needs inspection',async()=>{
 jest.mocked(listBookArchives).mockResolvedValue([{...preview,complete:false,inspectionOnly:true}])
 render(<FieldbookArchiveRecovery {...props()}/>)
 expect(await screen.findByText(/Restoration metadata needs inspection/)).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Download original archive'})).toBeEnabled()
 expect(screen.queryByRole('button',{name:'Review and resume'})).not.toBeInTheDocument()
 expect(restoreBookArchive).not.toHaveBeenCalled()
})
