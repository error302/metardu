import { z } from 'zod'

// JSON.stringify silently converts Infinity to null. JSON.parse can produce it
// from syntactically valid numeric literals such as 1e400; reject before saving.
export const EngineeringPayloadSchema = z.record(z.unknown()).superRefine((data, ctx) => {
  const pending: { value: unknown; depth: number }[] = [{ value: data, depth: 0 }]
  const seen = new WeakSet<object>()
  let count = 0
  const reject = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message })
  while (pending.length) {
    const entry = pending.pop()
    if (!entry) break
    const { value, depth } = entry
    if (++count > 200000 || depth > 64) { reject('Engineering data exceeds the supported 200,000 JSON values or 64 nesting levels.'); return }
    if (value === null || typeof value === 'string' || typeof value === 'boolean') continue
    if (typeof value === 'number') {
      if (Number.isFinite(value)) continue
      reject('Engineering data must contain finite JSON numbers.'); return
    }
    if (typeof value !== 'object' || seen.has(value)) { reject('Engineering data must contain only non-cyclic JSON values.'); return }
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) { reject('Engineering data must contain plain JSON objects.'); return }
    seen.add(value)
    const children = Array.isArray(value) ? value : Object.values(value)
    if (children.length + pending.length + count > 200000) { reject('Engineering data exceeds the supported 200,000 JSON values.'); return }
    for (const child of children) pending.push({ value: child, depth: depth + 1 })
  }
})
