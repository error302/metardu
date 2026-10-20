import { escapeDocumentHtml } from '../escapeDocumentHtml'

it('keeps entered parcel and reviewer text inert in exported HTML', () => {
  expect(escapeDocumentHtml('<img src=x onerror="alert(1)"> & \'reviewer\''))
    .toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;reviewer&#39;')
})
