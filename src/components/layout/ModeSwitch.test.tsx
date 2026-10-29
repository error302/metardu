import {render,screen} from '@testing-library/react'
import {ModeSwitch} from './ModeSwitch'
it('offers one direct route between website and work without signing out',()=>{
 const {rerender}=render(<ModeSwitch target="workspace" authenticated/>)
 expect(screen.getByRole('link',{name:'Open dashboard'})).toHaveAttribute('href','/dashboard')
 rerender(<ModeSwitch target="website" authenticated/>)
 const home=screen.getByRole('link',{name:'Home'})
 expect(home).toHaveAttribute('href','/')
 expect(home).not.toHaveAttribute('title')
 expect(home.textContent).toBe('')
 expect(home.querySelector('svg')).toHaveAttribute('aria-hidden','true')
 expect(screen.queryByText('Website')).not.toBeInTheDocument()
 expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
