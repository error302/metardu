/** Only fixed classifications may leave the runner; never raw messages, SQL or provider URLs. */
export function reminderFailureCode(error:unknown):string {
  try{
    if(typeof error!=='object'||error===null)return 'REMINDER_RUN_FAILED'
    const code='code'in error?error.code:undefined
    if(['ECONNREFUSED','ECONNRESET','EHOSTUNREACH','ENETUNREACH','ENOTFOUND','EAI_AGAIN','08000','08001','08003','08006','57P01','57P02','57P03'].includes(typeof code==='string'?code:''))return 'REMINDER_DATABASE_UNAVAILABLE'
    if(code==='ETIMEDOUT'||code==='57014'||(error instanceof Error&&/timeout exceeded when trying to connect|connection terminated due to connection timeout/i.test(error.message)))return 'REMINDER_DATABASE_TIMEOUT'
    if(code==='28P01'||code==='28000'||code==='42501')return 'REMINDER_DATABASE_ACCESS'
    if(code==='42P01'||code==='42703'||code==='42883')return 'REMINDER_DATABASE_SCHEMA'
  }catch{ /* Diagnostics must not throw while reporting a failure. */ }
  return 'REMINDER_RUN_FAILED'
}
