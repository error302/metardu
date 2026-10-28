/** @jest-environment node */
import { requiredValue } from '@/test-utils/requiredValue'
import puppeteer from 'puppeteer'
import { generatePdf } from '@/lib/pdf/generatePdf'

jest.mock('puppeteer', () => ({ __esModule: true, default: { launch: jest.fn() } }))

function renderer() {
  const page = {
    setJavaScriptEnabled: jest.fn(), setRequestInterception: jest.fn(), on: jest.fn((_event: string, _listener: (request: { url(): string; abort(): void; continue(): void }) => void) => {}),
    setContent: jest.fn(), evaluate: jest.fn(), pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF test')),
  }
  const browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn() }
  ;(puppeteer.launch as jest.Mock).mockResolvedValue(browser)
  return {page,browser}
}

test('renders inert report HTML and honors requested paper orientation', async () => {
  const { page, browser } = renderer()
  await expect(generatePdf({ title:'Test', sections:[], paperSize:'A3', orientation:'landscape' })).resolves.toEqual(Buffer.from('%PDF test'))
  expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false)
  expect(page.setRequestInterception).toHaveBeenCalledWith(true)
  expect(page.pdf).toHaveBeenCalledWith(expect.objectContaining({format:'a3',landscape:true,preferCSSPageSize:false}))
  expect(browser.close).toHaveBeenCalled()
})

test('blocks external requests and reports missing embedded resources instead of exporting incomplete output', async () => {
  const {page,browser} = renderer()
  const abort = jest.fn()
  page.setContent.mockImplementation(async () => {
    const listener = requiredValue(page.on.mock.calls.find(([name]) => name === 'request'))[1]
    listener({url:()=> 'http://127.0.0.1/private',abort,continue:jest.fn()})
  })
  await expect(generatePdf({title:'Test',sections:[]})).rejects.toThrow('Embed images directly')
  expect(abort).toHaveBeenCalled()
  expect(page.pdf).not.toHaveBeenCalled()
  expect(browser.close).toHaveBeenCalled()
})
