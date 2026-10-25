import { fireEvent, render, screen } from '@testing-library/react'
import SkipToContent from '@/components/shared/SkipToContent'
it('moves keyboard focus to the main content without overwriting a sharing capability fragment', () => {
  window.history.replaceState({}, '', '/p/uuid#key=secret')
  const scroll = jest.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scroll,
  })
  render(
    <>
      <SkipToContent />
      <main id="main-content" tabIndex={-1}>
        Draft
      </main>
    </>,
  )
  fireEvent.click(screen.getByRole('link', { name: 'Skip to main content' }))
  expect(screen.getByRole('main')).toHaveFocus()
  expect(window.location.hash).toBe('#key=secret')
})
