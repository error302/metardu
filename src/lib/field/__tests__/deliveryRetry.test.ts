/** @jest-environment node */
import { fieldDeliveryFailure, mayRetryFieldDelivery } from '../deliveryRetry'

const now=Date.parse('2026-10-18T10:00:00Z')
beforeEach(()=>jest.spyOn(Date,'now').mockReturnValue(now))
afterEach(()=>jest.restoreAllMocks())

test('temporary failures back off exponentially with a bounded ordinary delay',()=>{
  const first=fieldDeliveryFailure(undefined,503)
  const second=fieldDeliveryFailure(first,503)
  expect(first).toMatchObject({attempts:1,blocked:false,nextAttemptAt:now+30000})
  expect(second.nextAttemptAt).toBe(now+60000)
  expect(fieldDeliveryFailure({...second,attempts:100},503).nextAttemptAt).toBe(now+900000)
  expect(mayRetryFieldDelivery(first,false)).toBe(false)
  expect(mayRetryFieldDelivery(first,true)).toBe(true)
})

test.each([400,401,403,404,409,422])('HTTP %s needs an explicit retry and preserves its reason',status=>{
  const retry=fieldDeliveryFailure(undefined,status)
  expect(retry.blocked).toBe(true)
  jest.mocked(Date.now).mockReturnValue(now+9999999)
  expect(mayRetryFieldDelivery(retry,false)).toBe(false)
  expect(mayRetryFieldDelivery(retry,true)).toBe(true)
})

test('Retry-After seconds and dates cannot be bypassed by a manual click',()=>{
  const retry=fieldDeliveryFailure(undefined,429,'120')
  expect(retry.nextAttemptAt).toBe(now+120000)
  expect(mayRetryFieldDelivery(retry,true)).toBe(false)
  expect(fieldDeliveryFailure(undefined,429,new Date(now+3600000).toUTCString()).nextAttemptAt).toBe(now+3600000)
  expect(fieldDeliveryFailure(undefined,429,'invalid').nextAttemptAt).toBe(now+30000)
  jest.mocked(Date.now).mockReturnValue(now+120001)
  expect(mayRetryFieldDelivery(retry,false)).toBe(true)
})
