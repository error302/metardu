/** Preserve the established revision hash convention in server/client code. */
export function canonicalJson(value:unknown):string {
  const sorted=(item:unknown):unknown=>{
    if(Array.isArray(item))return item.map(sorted)
    if(item&&typeof item==='object')return Object.keys(item as Record<string,unknown>).sort().reduce<Record<string,unknown>>((result,key)=>{
      result[key]=sorted((item as Record<string,unknown>)[key]);return result
    },{})
    return item
  }
  return JSON.stringify(sorted(value))
}
