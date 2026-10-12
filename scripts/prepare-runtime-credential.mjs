// Fill only the missing local runtime password. Preserve all existing settings.
import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { parse } from 'dotenv'
const path='.env'
const before=readFileSync(path,'utf8')
const values=parse(before)
if(values.APP_DB_PASSWORD?.trim()) { console.log('Runtime database password already configured; preserved.');process.exit(0) }
assert.ok(!process.env.APP_DB_PASSWORD,'An external runtime password is set; preserve its configured source.')
const matches=[...before.matchAll(/^APP_DB_PASSWORD\s*=.*$/gm)]
assert.ok(matches.length<=1,'Duplicate runtime password definitions need review.')
const password=randomBytes(32).toString('hex')
const entry=`APP_DB_PASSWORD=${password}`
const after=matches.length?before.replace(/^APP_DB_PASSWORD\s*=.*$/m,entry):before+(before.endsWith('\n')?'':'\n')+entry+'\n'
const updated=parse(after)
for(const [key,value] of Object.entries(values)) if(key!=='APP_DB_PASSWORD') assert.equal(updated[key],value,'Unrelated setting must not change.')
assert.equal(updated.APP_DB_PASSWORD,password)
if(!process.argv.includes('--write')) { console.log('Prepared only: one missing runtime password can be generated with --write. No credential values printed.');process.exit(0) }
writeFileSync(path,after)
mkdirSync('test-results/production-upgrade',{recursive:true})
writeFileSync('test-results/production-upgrade/credential-preparation.json',JSON.stringify({configuredMissingRuntimePassword:true,otherSettingsPreserved:true,passwordPrinted:false,bytesOfRandomness:32,priorFileSha256:createHash('sha256').update(before).digest('hex'),updatedFileSha256:createHash('sha256').update(after).digest('hex'),productionRoleChanged:false},null,2)+'\n')
console.log('Configured the missing local runtime password; all other settings preserved. No production role changed.')
