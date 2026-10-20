import { dmsToDecimal } from './angles'

/** An operator must declare the encoding; never infer packed DMS from a decimal. */
export function declaredCaptureBearing(text: string, encoding: 'decimal_degrees' | 'packed_dms' | 'separated_dms'): number {
  const value = text.trim()
  if (encoding === 'decimal_degrees') {
    if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new Error('The adopted decimal bearing is invalid.')
    const number = Number(value)
    if (!Number.isFinite(number) || number < 0 || number > 360) throw new Error('The adopted decimal bearing is outside 0–360 degrees.')
    return number
  }
  let degrees: number, minutes: number, seconds: number
  if (encoding === 'packed_dms') {
    const match = /^(\d{1,3})(?:\.(\d{1,12}))?$/.exec(value)
    if (!match) throw new Error('The adopted packed-DMS bearing is invalid.')
    const fraction = (match[2] ?? '').padEnd(4, '0')
    degrees = Number(match[1]); minutes = Number(fraction.slice(0, 2))
    seconds = Number(fraction.slice(2, 4) + (fraction.length > 4 ? `.${fraction.slice(4)}` : ''))
  } else {
    const match = /^(\d{1,3})(?:°|\s)\s*(\d{1,2})(?:['′]|\s)\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″])?$/.exec(value)
    if (!match) throw new Error('The adopted separated-DMS bearing is invalid.')
    degrees = Number(match[1]); minutes = Number(match[2]); seconds = Number(match[3])
  }
  if (degrees > 360 || minutes >= 60 || seconds >= 60 || degrees === 360 && (minutes !== 0 || seconds !== 0)) throw new Error('The adopted bearing has invalid DMS components.')
  return dmsToDecimal({ degrees, minutes, seconds, direction: 'E' })
}
