import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
const root='test-results/chatgpt-notice-publication'
const publication=JSON.parse(readFileSync(`${root}/publication.json`,'utf8'))
assert.equal(publication.status,'published');assert.equal(publication.customerLinkingEnabled,false)
function docker(args,timeout=30000){const result=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout,maxBuffer:2*1024*1024});assert.equal(result.status,0,'Notice backup operation failed; private diagnostics suppressed');return result.stdout.trim()}
const names=['metardu-app','metardu-postgres','metardu-redis','metardu-worker','metardu-collaboration','metardu-ntrip','metardu-backup']
const before=JSON.parse(docker(['inspect',...names]))
assert.equal(before.find(item=>item.Name==='/metardu-app').Image,publication.imageId)
assert.equal(before.find(item=>item.Name==='/metardu-app').State.Health.Status,'healthy')
const output=docker(['exec','-e','BACKUP_RETENTION=36500','metardu-backup','/app/scripts/backup.sh'],60000)
assert.ok(output.includes('Backup integrity verified.')&&output.includes('Backup complete.'))
const database=output.match(/Database backup: (\/backups\/db_[0-9_]+\.sql\.gz)/)?.[1]
const uploads=output.match(/Uploads backup: (\/backups\/uploads_[0-9_]+\.tar\.gz)/)?.[1]
assert.ok(database&&uploads)
const record=JSON.parse(docker(['exec','metardu-backup','tar','-xOzf',uploads,`./.metardu-system/notices/${publication.version}.json`]))
assert.equal(record.version,publication.version);assert.equal(record.contentSha256,publication.contentSha256);assert.equal(record.publishedAt,publication.publishedAt);assert.equal(record.publicationScope,'in-platform')
const after=JSON.parse(docker(['inspect',...names]))
for(const previous of before){const current=after.find(item=>item.Name===previous.Name);assert.equal(current.Id,previous.Id);assert.equal(current.Image,previous.Image);assert.equal(current.State.StartedAt,previous.State.StartedAt);assert.deepEqual(current.Mounts,previous.Mounts)}
const proof={recordedAt:new Date().toISOString(),releaseId:publication.releaseId,imageId:publication.imageId,database,uploads,publicationVersion:record.version,publicationTimestamp:record.publishedAt,publicationDigest:record.contentSha256,noticeRecordExtractedAndMatched:true,archiveIntegrityAndHeadersVerified:true,latestArchiveSeparatelyRestored:false,applicationAndSupportingServicesRestarted:false,originalArchivesPreserved:true,customerPayloadLogged:false}
writeFileSync(`${root}/backup.json`,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof,null,2))
