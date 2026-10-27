import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import path from 'node:path'

const root=process.cwd()
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash'
assert.ok(existsSync(bash),'A real Bash executable is required to exercise the actual hook')
mkdirSync(path.join(root,'.cache/pre-push-range-tests'),{recursive:true})
const base=mkdtempSync(path.join(root,'.cache/pre-push-range-tests/run-'))
const hook=path.join(root,'.gite/hooks/pre-push')
const local='a'.repeat(40),remote='b'.repeat(40)
const refs=`refs/heads/synthetic ${local} refs/heads/synthetic ${remote}\n`

function invoke(name,{args=['origin','https://example.invalid/synthetic.git'],input='',changed=false,securityFailure=false}={}){
 const directory=path.join(base,name);mkdirSync(directory)
 const log=path.join(directory,'calls.log');writeFileSync(log,'')
 const stub=path.join(directory,'commands.sh')
 writeFileSync(stub,`
git() {
 printf 'git %s\\n' "$*" >> "$METARDU_HOOK_TEST_LOG"
 if [ "$1" = diff ] && [ "$METARDU_HOOK_TEST_CHANGED" = 1 ]; then printf 'src/synthetic.ts\\n'; fi
 return 0
}
node() {
 printf 'node %s\\n' "$*" >> "$METARDU_HOOK_TEST_LOG"
 if [ "$1" = scripts/security-and-bug-gate.mjs ] && [ "$METARDU_HOOK_TEST_SECURITY_FAILURE" = 1 ]; then return 1; fi
 return 0
}
npx() { printf 'npx %s\\n' "$*" >> "$METARDU_HOOK_TEST_LOG"; return 0; }
gitleaks() { printf 'gitleaks %s\\n' "$*" >> "$METARDU_HOOK_TEST_LOG"; return 0; }
timeout() { shift; "$@"; }
`)
 const result=spawnSync(bash,[hook,...args],{cwd:root,input,encoding:'utf8',timeout:10000,windowsHide:true,env:{...process.env,CI:'',SKIP_PRE_PUSH:'',SKIP_PRE_PUSH_TESTS:'',BASH_ENV:stub.replaceAll('\\','/'),METARDU_HOOK_TEST_LOG:log.replaceAll('\\','/'),METARDU_HOOK_TEST_CHANGED:changed?'1':'0',METARDU_HOOK_TEST_SECURITY_FAILURE:securityFailure?'1':'0'}})
 assert.ifError(result.error)
 return {...result,calls:readFileSync(log,'utf8')}
}

test('a Git-style hook invocation with no refs does not invent a main-branch push',()=>{
 const result=invoke('no-refs')
 assert.equal(result.status,0,result.stderr)
 assert.equal(result.calls,'','An already synchronized push has no commits to validate')
 assert.match(result.stdout,/no refs to push/i)
 assert.doesNotMatch(result.stdout,/all local gates passed/)
})

test('manual invocation retains its explicit source-check fallback',()=>{
 const result=invoke('manual',{args:[],changed:true})
 assert.equal(result.status,0,result.stderr)
 assert.match(result.calls,/git diff.*origin\/main\.\.\.HEAD/)
 assert.match(result.calls,/node scripts\/security-and-bug-gate/)
 assert.match(result.calls,/npx tsc --noEmit/)
})

test('documentation-only refs run invariant gates without borrowing unrelated changes',()=>{
 const result=invoke('docs',{input:refs})
 assert.equal(result.status,0,result.stderr)
 assert.match(result.calls,new RegExp(`git diff.*${remote}\\.\\.\\.${local}`))
 assert.match(result.calls,/node scripts\/security-and-bug-gate/)
 assert.match(result.calls,/node scripts\/schema-drift-gate/)
 assert.doesNotMatch(result.calls,/npx|origin\/main/)
})

test('source refs still invoke type, query, lint, secret and related-test commands',()=>{
 const result=invoke('source',{input:refs,changed:true})
 assert.equal(result.status,0,result.stderr)
 for(const marker of ['npx tsc --noEmit','node scripts/api-row-sweep.mjs','node scripts/lint-changed-files.mjs','gitleaks git','npx jest'])assert.ok(result.calls.includes(marker),marker)
})

test('a failed invariant still blocks an actual source push',()=>{
 const result=invoke('security-failure',{input:refs,changed:true,securityFailure:true})
 assert.equal(result.status,1)
 assert.match(result.stderr,/BLOCKED.*security-and-bug-gate failed/)
})
