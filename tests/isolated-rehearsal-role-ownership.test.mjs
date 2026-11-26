import test from 'node:test'
import assert from 'node:assert/strict'
import * as rehearsalDatabase from '../scripts/rehearsal-database.mjs'
import * as releasePlan from '../scripts/release-plan.mjs'

function requiredFunction(name){
  const value=rehearsalDatabase[name]
  assert.equal(typeof value,'function',`Missing isolated rehearsal role contract: ${name}`)
  return value
}
function role(name,overrides={}){
  return {rolname:name,rolcanlogin:false,rolsuper:false,rolbypassrls:false,...overrides}
}

test('the isolated rehearsal owns and removes only compatibility roles created by the current run',()=>{
  const createOwnership=requiredFunction('createIsolatedRehearsalRoleOwnership')
  const recordBefore=requiredFunction('recordIsolatedRehearsalCompatibilityRoles')
  const ownCreated=requiredFunction('ownIsolatedRehearsalCompatibilityRoles')
  const runtimeRole='metardu_release_app_eac2835e377f59dd0d1b1ff98cb3fbc311401f22'
  const ownership=createOwnership(runtimeRole)
  const before=recordBefore([role('authenticated')])
  assert.deepEqual(before.existing,['authenticated'])
  assert.deepEqual(before.missing,['anon','service_role'])

  ownCreated(ownership,{
    before,
    after:[role('authenticated'),role('anon'),role('service_role')],
  })

  assert.deepEqual([...ownership.ownedRoles].sort(),['anon','service_role'])
  assert.equal(ownership.ownedRoles.has('authenticated'),false)

  rehearsalDatabase.ownRecoveryRole(ownership,runtimeRole)
  const cleanup=rehearsalDatabase.recoveryRolesForCleanup(ownership,{databaseCreated:true,databaseRemoved:true})
  assert.ok(cleanup.includes(runtimeRole))
  assert.ok(cleanup.includes('anon'))
  assert.ok(cleanup.includes('service_role'))
  assert.equal(cleanup.includes('authenticated'),false)
  assert.deepEqual(rehearsalDatabase.recoveryRolesForCleanup(ownership,{databaseCreated:true,databaseRemoved:false}),[runtimeRole])
})

test('isolated cleanup drops and verifies only run-owned roles while retaining pre-existing roles',async()=>{
  const cleanup=requiredFunction('cleanupIsolatedRehearsalRoles')
  const createOwnership=requiredFunction('createIsolatedRehearsalRoleOwnership')
  const recordBefore=requiredFunction('recordIsolatedRehearsalCompatibilityRoles')
  const runtimeRole='metardu_release_app_eac2835e377f59dd0d1b1ff98cb3fbc311401f22'
  const ownership=createOwnership(runtimeRole)
  const before=recordBefore([role('authenticated')])
  let rows=[
    role('authenticated'),
    role('anon'),
    role('service_role'),
    {rolname:runtimeRole,rolcanlogin:true,rolsuper:false,rolbypassrls:false},
  ]
  const dropped=[]
  const result=await cleanup({
    ownership,
    before,
    databaseCreated:true,
    databaseRemoved:true,
    runtimeRoleAbsentBefore:true,
    listRoles:async()=>rows,
    dropRole:async name=>{
      dropped.push(name)
      rows=rows.filter(row=>row.rolname!==name)
    },
  })
  assert.deepEqual(dropped,[runtimeRole,'service_role','anon'])
  assert.deepEqual(result.removed,[runtimeRole,'service_role','anon'])
  assert.deepEqual(result.retained,['authenticated'])
  assert.deepEqual(rows.map(row=>row.rolname),['authenticated'])

  await assert.rejects(()=>cleanup({
    ownership:createOwnership(runtimeRole),
    before,
    databaseCreated:true,
    databaseRemoved:true,
    runtimeRoleAbsentBefore:true,
    listRoles:async()=>[],
    dropRole:async()=>{},
  }),/pre-existing|retained/i)
})

test('the unified release-contract inventory includes the isolated role-ownership regression',()=>{
  assert.ok(releasePlan.UNIFIED_RELEASE_CONTRACT_TESTS.includes('tests/isolated-rehearsal-role-ownership.test.mjs'))
})

test('unsafe pre-existing compatibility roles and roles not created by the run are rejected or retained',()=>{
  const createOwnership=requiredFunction('createIsolatedRehearsalRoleOwnership')
  const recordBefore=requiredFunction('recordIsolatedRehearsalCompatibilityRoles')
  const ownCreated=requiredFunction('ownIsolatedRehearsalCompatibilityRoles')
  const ownership=createOwnership('metardu_release_app_eac2835e377f59dd0d1b1ff98cb3fbc311401f22')
  assert.throws(()=>recordBefore([role('authenticated',{rolcanlogin:true})]),/login/i)
  assert.throws(()=>recordBefore([role('authenticated',{rolsuper:true})]),/super/i)
  assert.throws(()=>recordBefore([role('authenticated',{rolbypassrls:true})]),/bypass/i)

  const before=recordBefore([role('authenticated')])
  ownCreated(ownership,{before,after:[role('authenticated'),role('anon')]})
  assert.equal(ownership.ownedRoles.has('authenticated'),false)
  assert.equal(ownership.ownedRoles.has('service_role'),false)
  assert.equal(ownership.ownedRoles.has('anon'),true)
})
