/** @jest-environment node */
import { readBytesBounded, readTextBounded } from '@/lib/security/requestBody'

it('accepts exactly the byte limit, including multi-byte UTF-8',async()=>{
  const bytes=new TextEncoder().encode('pima —');const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes);controller.close()}})
  expect(await readTextBounded(stream,bytes.length)).toBe('pima —')
})
it('cancels an over-limit stream without needing a Content-Length header',async()=>{
  const cancel=jest.fn();const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array([1,2,3]));controller.enqueue(new Uint8Array([4,5,6]))},cancel})
  expect(await readBytesBounded(stream,5)).toBeNull();expect(cancel).toHaveBeenCalledTimes(1);expect(stream.locked).toBe(false)
})
it('keeps binary bytes intact while refusing invalid UTF-8 for text',async()=>{
  const stream=()=>new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array([0xff,0xfe]));controller.close()}})
  expect(await readBytesBounded(stream(),2)).toEqual(new Uint8Array([0xff,0xfe]));expect(await readTextBounded(stream(),2)).toBeNull()
})
it('releases a failed stream and preserves the read error',async()=>{
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.error(new Error('Synthetic interrupted upload'))}})
  await expect(readBytesBounded(stream,5)).rejects.toThrow('Synthetic interrupted upload');expect(stream.locked).toBe(false)
})
it('retains empty-body behavior',async()=>{expect(await readTextBounded(null,5)).toBe('');expect(await readBytesBounded(null,5)).toEqual(new Uint8Array())})
