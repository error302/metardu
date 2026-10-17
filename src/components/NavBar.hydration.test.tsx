import React, { act } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { SearchTrigger } from './NavBar'

it('hydrates the server shortcut safely before showing the Mac shortcut', async () => {
  const platform = Object.getOwnPropertyDescriptor(navigator, 'platform')
  Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const t = (key: string) => key
  const recoverable = jest.fn()
  let root: ReturnType<typeof hydrateRoot> | undefined
  try {
    container.innerHTML = renderToString(<SearchTrigger t={t} />)
    expect(container.querySelector('kbd')?.textContent).toBe('Ctrl K')
    await act(async () => { root = hydrateRoot(container, <SearchTrigger t={t} />, { onRecoverableError: recoverable }) })
    expect(container.querySelector('kbd')?.textContent).toBe('⌘K')
    expect(recoverable).not.toHaveBeenCalled()
  } finally {
    await act(async () => root?.unmount())
    container.remove()
    if (platform) Object.defineProperty(navigator, 'platform', platform)
    else Reflect.deleteProperty(navigator, 'platform')
  }
})
