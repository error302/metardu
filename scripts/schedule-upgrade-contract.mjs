import assert from 'node:assert/strict'
export const SCHEDULE_UPGRADE_VERSION='124_project_schedules_and_phone_reminders'
export function assertScheduleUpgradeProof(proof,expected){
 assert.ok(expected?.sourceRegistry,'A pinned registry is required')
 assert.deepEqual(expected.pending,[SCHEDULE_UPGRADE_VERSION])
 assert.deepEqual(proof.pending,expected.pending)
 assert.equal(proof.sourceBaseline,128)
 assert.equal(proof.targetLedgerCount,129)
 assert.deepEqual(proof.sourceRegistry,expected.sourceRegistry)
 assert.equal(proof.sourceRegistry.length,129)
 assert.deepEqual(proof.variants,['canonical','existing_schedule_table'])
 for(const key of ['originalValuesPreserved','historicalHashesPreserved','normalRuntimeProvisioning','restrictedRoleVerified','scheduleLifecycleVerified','reminderDeliveryVerified','incompatibleDataRejected'])
  assert.equal(proof[key],true,'Missing scheduling evidence: '+key)
 assert.equal(proof.productionMutated,false)
 assert.equal(proof.cleanup?.syntheticRoleRemoved,true)
 assert.ok(proof.checks?.length>=15)
}
