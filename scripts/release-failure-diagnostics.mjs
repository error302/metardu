import {spawnSync} from 'node:child_process'

/** Safe failure metadata deliberately excludes argv, environment and raw output. */
export function commandFailureDetails(binary, action, result, timeoutMs) {
  return {binary,action,exit:result.status??null,signal:result.signal??null,
    errorCode:typeof result.error?.code==='string'?result.error.code:null,timeoutMs}
}
export function redactReleaseDiagnostic(text, environment) {
  let safe=String(text??'')
  const values=Object.entries(environment).filter(([key,value])=>typeof value==='string'&&value.length>0
    &&(value.length>=6||/password|secret|token|api_key|credential|database_url/i.test(key))).map(([,value])=>value)
  for(const value of values.sort((a,b)=>b.length-a.length)) {
    safe=safe.replaceAll(value,'[configured]')
  }
  return safe.slice(-32768)
}

/** Bounded best-effort reads; diagnostic failures never prevent rollback. */
export function collectFailedAppDiagnostics(expectedImage, environment, run=spawnSync) {
  try {
    const inspect=run('docker',['inspect','metardu-app'],{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:2*1024*1024})
    if(inspect.status!==0)return {captured:false,phase:'inspect',...commandFailureDetails('docker','inspect',inspect,5000)}
    const [app]=JSON.parse(inspect.stdout)
    if(app.Name!=='/metardu-app'||app.Config?.Labels?.['com.docker.compose.project']!=='metardu'||app.Image!==expectedImage) {
      return {captured:false,phase:'candidate-not-current'}
    }
    const logs=run('docker',['logs','--timestamps','--tail','100','metardu-app'],{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:2*1024*1024})
    const scrub=text=>redactReleaseDiagnostic(text,environment)
    return {captured:true,image:app.Image,id:app.Id,status:app.State.Status,running:app.State.Running,
      oomKilled:app.State.OOMKilled,exitCode:app.State.ExitCode,stateError:scrub(app.State.Error),
      health:app.State.Health?{status:app.State.Health.Status,failingStreak:app.State.Health.FailingStreak,
        log:app.State.Health.Log.slice(-5).map(entry=>({start:entry.Start,end:entry.End,exitCode:entry.ExitCode,output:scrub(entry.Output)}))}:null,
      logRead:commandFailureDetails('docker','logs',logs,5000),logs:scrub((logs.stdout??'')+'\n'+(logs.stderr??''))}
  }catch{return {captured:false,phase:'inspection-unavailable'}}
}
