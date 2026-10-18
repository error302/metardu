import {fireEvent,render,screen} from '@testing-library/react'
import {CadWorkspaceShell,isCadWorkspaceRoute} from './CadWorkspaceShell'
jest.mock('@/components/NavBar',()=>({__esModule:true,default:()=> <nav aria-label="Site navigation">Site navigation</nav>}))
test('both editor routes use a focused workspace, while unrelated routes keep their usual shell',()=>{
  expect(isCadWorkspaceRoute('/tools/cad-editor')).toBe(true)
  expect(isCadWorkspaceRoute('/project/123/cad-editor')).toBe(true)
  expect(isCadWorkspaceRoute('/project/123/control')).toBe(false)
})
test('site navigation can expand and collapse without remounting the drawing',()=>{
  render(<CadWorkspaceShell><div data-testid="drawing">Saved drawing</div></CadWorkspaceShell>)
  const drawing=screen.getByTestId('drawing'),toggle=screen.getByRole('button',{name:'Show site navigation'})
  expect(screen.queryByRole('navigation',{name:'Site navigation'})).not.toBeInTheDocument()
  fireEvent.click(toggle)
  expect(screen.getByRole('navigation',{name:'Site navigation'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Hide site navigation'}))
  expect(screen.getByTestId('drawing')).toBe(drawing)
})
