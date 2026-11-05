import {render,screen,fireEvent} from '@testing-library/react'
import {CollaborationPanel} from './CollaborationPanel'
jest.mock('./PresenceIndicator',()=>({PresenceIndicator:()=>null}))
const scrollDescriptor=Object.getOwnPropertyDescriptor(Element.prototype,'scrollIntoView')
beforeAll(()=>Object.defineProperty(Element.prototype,'scrollIntoView',{configurable:true,value:jest.fn()}))
afterAll(()=>{if(scrollDescriptor)Object.defineProperty(Element.prototype,'scrollIntoView',scrollDescriptor);else delete (Element.prototype as Partial<Element>).scrollIntoView})
test('viewer controls stay read-only even when the room is connected',()=>{
  const onSend=jest.fn(()=>true)
  render(<CollaborationPanel collaborators={[]} messages={[]} isConnected canChat={false} onSend={onSend}/> )
  expect(screen.getByRole('textbox')).toBeDisabled()
  expect(screen.getByRole('button',{name:'Send message'})).toBeDisabled()
  expect(screen.getByText('Read-only project access.')).toBeInTheDocument()
  expect(onSend).not.toHaveBeenCalled()
})
test('failed send retains the typed message instead of displaying a false delivery',()=>{
  const onSend=jest.fn(()=>false)
  render(<CollaborationPanel collaborators={[]} messages={[]} isConnected onSend={onSend}/> )
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Please check the source control'}})
  fireEvent.click(screen.getByRole('button',{name:'Send message'}))
  expect(screen.getByRole('textbox')).toHaveValue('Please check the source control')
  expect(screen.getByRole('alert')).toHaveTextContent('Message was not sent')
})
test('disconnected room shows the actual availability reason and disables sends',()=>{
  render(<CollaborationPanel collaborators={[]} messages={[]} isConnected={false} onSend={()=>false} connectionStatus="Secure collaboration is unavailable on this deployment."/> )
  expect(screen.getByText('Secure collaboration is unavailable on this deployment.')).toBeInTheDocument()
  expect(screen.getByRole('textbox')).toBeDisabled()
})
