declare module 'puppeteer' {
  export interface PageRequest {
    url(): string
    continue(): Promise<void>
    abort(): Promise<void>
  }

  export interface PDFOptions {
    format?: 'a4' | 'a3' | string
    landscape?: boolean
    printBackground?: boolean
    margin?: {
      top?: string
      right?: string
      bottom?: string
      left?: string
    }
    displayHeaderFooter?: boolean
    preferCSSPageSize?: boolean
  }

  export interface Page {
    setJavaScriptEnabled(enabled: boolean): Promise<void>
    setRequestInterception(value: boolean): Promise<void>
    on(event: 'request', handler: (req: PageRequest) => void): this
    setContent(html: string, options?: { waitUntil?: string }): Promise<void>
    evaluate<T>(fn: () => T | Promise<T>): Promise<T>
    pdf(options?: PDFOptions): Promise<Uint8Array | Buffer>
  }

  export interface Browser {
    newPage(): Promise<Page>
    close(): Promise<void>
  }

  export interface LaunchOptions {
    headless?: boolean
    args?: string[]
  }

  export function launch(options?: LaunchOptions): Promise<Browser>

  const puppeteer: {
    launch: typeof launch
  }

  export default puppeteer
}
