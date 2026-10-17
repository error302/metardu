import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Footer from './Footer'

it('exempts the complete public contact link from Cloudflare email rewriting', () => {
  const html = renderToStaticMarkup(<Footer />)
  const contact = html.match(/<!--email_off-->([\s\S]*?)<!--\/email_off-->/)?.[1]
  expect(contact).toMatch(/^<a href="mailto:hello@metardu\.app"/)
  expect(contact).toContain('hello@metardu.app <span aria-hidden="true"')
  expect(contact).toMatch(/<\/a>$/)
  expect(html).toContain('focus-visible:outline')
})
