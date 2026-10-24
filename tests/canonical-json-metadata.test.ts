/** @jest-environment node */
import { canonicalJson } from '@/lib/provenance/canonicalJson'
test('canonical JSON binds reserved property names as ordinary retained metadata',()=>{
  const value:unknown=JSON.parse('{"z":1,"__proto__":{"retained":"evidence"},"a":0}')
  expect(canonicalJson(value)).toBe('{"__proto__":{"retained":"evidence"},"a":0,"z":1}')
})
