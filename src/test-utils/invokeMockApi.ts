import { NextRequest } from 'next/server'
import type { ApiHandlerContext } from '@/lib/apiHandler'
/** Invoke the inner callback only in suites that explicitly replace apiHandler. */
export async function invokeMockApi(route: unknown, context: Partial<ApiHandlerContext> = {}, request = new NextRequest('http://127.0.0.1/synthetic-unit-test')): Promise<Response> {
  if (typeof route !== 'function') throw new Error('Expected the mocked API callback')
  const result: unknown = await Reflect.apply(route, undefined, [request, { session: null, userId: '', body: undefined, params: {}, ...context }])
  if (!(result instanceof Response)) throw new Error('Mocked API callback did not return a Response')
  return result
}
