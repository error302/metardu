import '@testing-library/jest-dom'

// Polyfill Request/Response for Next.js server utilities in tests
if (typeof globalThis.Request === 'undefined') {
  globalThis.Request = class Request {
    url: string
    method: string
    headers: Map<string, string>
    private _body: string | null
    constructor(url: string, init?: any) {
      this.url = url
      this.method = init?.method || 'GET'
      this._body = init?.body || null
      this.headers = new Map(Object.entries(init?.headers || {}))
    }
    async json() { return JSON.parse(this._body || '{}') }
    async text() { return this._body || '' }
  } as any
}

if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = class Response {
    status: number
    private _body: string
    headers: Map<string, string>
    constructor(body?: string | null, init?: any) {
      this.status = init?.status || 200
      this._body = body || ''
      this.headers = new Map(Object.entries(init?.headers || {}))
    }
    async json() { return JSON.parse(this._body) }
  } as any
}
