import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
const npmCli=[process.env.npm_execpath,path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),path.resolve(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].find(file=>file&&path.basename(file)==='npm-cli.js'&&existsSync(file))
if(!npmCli)throw new Error('The installed npm CLI could not be located')
const root='test-results/dependency-security'
await mkdir(root,{recursive:true})
let failed=false
for(const scope of ['runtime','full']){
 const result=spawnSync(process.execPath,[npmCli,'audit','--package-lock-only','--json',...(scope==='runtime'?['--omit=dev']:[])],{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024})
 if(result.error||![0,1].includes(result.status)){console.error(`${scope} audit failed to execute successfully`);failed=true;continue}
 let report
 try{report=JSON.parse(result.stdout)}catch{console.error(`${scope} audit returned invalid JSON`);failed=true;continue}
 if(report.error||!report.metadata?.vulnerabilities){console.error(`${scope} audit did not provide advisory counts`);failed=true;continue}
 await writeFile(`${root}/${scope}-audit.json`,JSON.stringify(report,null,2)+'\n')
 const counts=report.metadata.vulnerabilities
 if(!['critical','high','moderate','low'].every(key=>Number.isInteger(counts[key])&&counts[key]>=0)){console.error(`${scope} audit did not provide valid advisory counts`);failed=true;continue}
 console.log(`${scope}: ${counts.critical} critical, ${counts.high} high, ${counts.moderate} moderate, ${counts.low} low`)
 if(counts.critical>0||scope==='runtime'&&counts.high>0)failed=true
}
if(failed)process.exitCode=1
