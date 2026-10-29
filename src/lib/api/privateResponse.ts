import { NextResponse } from 'next/server'
/** Authenticated survey data must not enter shared or browser HTTP caches. */
export function privateApiSuccess(data:unknown,status=200) {
  return NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}})
}
