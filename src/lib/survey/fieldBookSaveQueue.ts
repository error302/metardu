// Shared only within the browser tab: finish a field-book save before computing.
const pending = new Map<string, Promise<boolean>>();
const flushers = new Map<string, () => Promise<boolean>>();
export function trackFieldBookSave(id: string, save: Promise<boolean>) { pending.set(id,save); }
export function registerFieldBookFlush(id:string,flush:()=>Promise<boolean>) {
  flushers.set(id,flush);
  return ()=>{ if(flushers.get(id)===flush) flushers.delete(id); };
}
export async function flushFieldBook(id:string):Promise<boolean> {
  const flush=flushers.get(id);
  if(flush && !await flush()) return false;
  let latest=pending.get(id);
  while(latest) {
    if(!await latest) return false;
    if(latest===pending.get(id)) return true;
    latest=pending.get(id);
  }
  return true;
}
