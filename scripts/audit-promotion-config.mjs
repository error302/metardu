import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
function docker(args) {
  const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30_000})
  if(r.status!==0)throw new Error(`Docker ${args[0]} configuration check failed; credential output suppressed.`)
  return r.stdout
}
const config=JSON.parse(docker(['compose','-f','docker-compose.yml','config','--format','json']))
const containers=JSON.parse(docker(['inspect','metardu-app','metardu-postgres','metardu-backup']))
const env=item=>Object.fromEntries(item.Config.Env.map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)]}))
const old=env(containers[0]),postgres=env(containers[1]),next=config.services['metardu-app'].environment
const admin=config.services['metardu-postgres'].environment
const report={composeConfigReady:true,currentImage:containers[0].Image,
 authSecretPreserved:old.AUTH_SECRET===next.AUTH_SECRET,workerSecretPreserved:old.WORKER_SECRET===next.WORKER_SECRET,
 adminPasswordPreserved:postgres.POSTGRES_PASSWORD===admin.POSTGRES_PASSWORD,
 databaseNamePreserved:postgres.POSTGRES_DB===admin.POSTGRES_DB,
 appRoleDistinctFromAdmin:next.DB_USER!==admin.POSTGRES_USER,appPasswordPresent:Boolean(next.DB_PASSWORD),
 appPasswordDistinctFromAdmin:next.DB_PASSWORD!==admin.POSTGRES_PASSWORD,
 publicOriginPreserved:old.NEXT_PUBLIC_APP_URL===next.NEXT_PUBLIC_APP_URL,callbackOriginPreserved:old.NEXTAUTH_URL===next.NEXTAUTH_URL,
 optionalCredentials:['PAYPAL_CLIENT_SECRET','NVIDIA_API_KEY','API_ADMIN_KEY'].map(key=>({key,present:Boolean(next[key]),preserved:(old[key]||'')===(next[key]||'')}))}
mkdirSync('test-results/production-upgrade',{recursive:true})
writeFileSync('test-results/production-upgrade/config-readiness.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
