import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'

function ignored(paths){
 const result=spawnSync('git',['check-ignore','--no-index','--stdin'],{input:paths.join('\n')+'\n',encoding:'utf8',windowsHide:true})
 assert.ok(result.status===0||result.status===1,result.stderr)
 return result.stdout.trim().split(/\r?\n/).filter(Boolean)
}
test('actual ignore rules permit upload API source in clean Git checkouts',()=>{
 assert.deepEqual(ignored(['src/app/api/field/mbtiles/upload/route.ts','src/app/api/parsers/upload/route.ts']),[])
})
test('actual runtime upload data and private QA/configuration paths remain ignored',()=>{
 const privatePaths=['upload/synthetic-ignore-check.mbtiles','.cache/synthetic-ignore-check.json','.env.synthetic-ignore-check']
 assert.deepEqual(ignored(privatePaths),privatePaths)
})

test('only reviewed public root environment templates are admitted',()=>{
 assert.deepEqual(ignored(['.env.example','.env.production.example','.env.test.example']),[])
 assert.deepEqual(ignored(['.env.private.example','nested/.env.example']),['.env.private.example','nested/.env.example'])
})
