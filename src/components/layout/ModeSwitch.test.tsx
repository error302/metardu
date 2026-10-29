import {render,screen} from '@testing-library/react'
import {ModeSwitch} from './ModeSwitch'
it('offers one direct route between website and work without signing out',()=>{
 const {rerender}=render(<ModeSwitch target="workspace" authenticated/>)
 expect(screen.getByRole('link',{name:'Open dashboard'})).toHaveAttribute('href','/dashboard')
 rerender(<ModeSwitch target="website" authenticated/>)
 expect(screen.getByRole('link',{name:'Open METARDU website'})).toHaveAttribute('href','/')
 expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
