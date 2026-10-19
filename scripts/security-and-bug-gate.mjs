#!/usr/bin/env node
/**
 * security-and-bug-gate.mjs — Deterministic CI/CD & pre-push security/bug invariant gate.
 *
 * Catches high-impact regressions and security vulnerabilities that standard
 * typecheck/ESLint passes can miss:
 *   1. Applied SQL migration immutability (000..114 canonical production ledger)
 *   2. /api/db proxy security invariants (forbidden tables, read-only raw observations,
 *      profile privilege escalation guard, RLS context reset, ownership column stripping)
 *   3. Next.js & PWA field-safety invariants (no forced reloadOnOnline/skipWaiting,
 *      NetworkOnly navigation, no ignoreBuildErrors/ignoreDuringBuilds)
 *   4. Test isolation guard (prevents un-restored global crypto.randomUUID mutation)
 *   5. Tracked-file live secret & private key guard (GOCSPX-, sk_live_, re_*, PEM keys)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { collectFileMigrations, computeDrift } from './verify-migrations.mjs'

const ROOT = process.cwd()

// Canonical applied production migration checksums (000..114, 119 entries)
const APPLIED_PRODUCTION_LEDGER = [
  { version: '000_canonical_schema', checksum: 'df699a8f8e97a2b6acfd570ad3d49ee20aae3657cffc80101e861ab7d8a95f55' },
  { version: '001_rbac_fixed', checksum: '04fd1ae80b6b6d8d3f4b1469307680e563fbe54bb205c24b828631f8e14319c2' },
  { version: '002_rls_fixed', checksum: '470f7f6c3170c8a3646b2f4db9781a407ede054d6b616629a75ab5430d64ac12' },
  { version: '003_rls_missing_tables', checksum: '1d196d92f69130df4ec08fc11f6179caa08a97eae1e869ab8fede2cfada8117f' },
  { version: '004_payment_history_fix', checksum: 'ec2cef6946e0a8fc5ffaf8fcbeaab9ef9f6b23a956d7d114e32baca8d6c55b32' },
  { version: '005_audit_triggers_precision', checksum: '8416b49dd4b4ce986da7d403663d4dc56a7d9948603497e286cf6c84d5d0f5cd' },
  { version: '006_entity_versioning', checksum: '69ee48d17c35adaee13e59bc559f8e5bedb88fce3d9056aa64e0942bb6d75baa' },
  { version: '007_phase4_5_6_tables', checksum: 'b6466869a817693bc3c2aee54ebefd17a6c816730313185f46aa31463d388eda' },
  { version: '008_phase10_indexes_and_audit', checksum: '15b4ec363f3441999ec8716f276a22cfda45cbc657a8e5966b28922cbe3766ec' },
  { version: '009_rbac_tables', checksum: 'afeb32ff251961e78e126a7a0f6b780e5dd0f95c597737b4ed7d6e62242ea1c4' },
  { version: '010_dpa2019_compliance', checksum: '5dff83ae1d6dadac24319d4c6f92e82c88f2b430f69c7d68f5116104acf19d79' },
  { version: '011_disable_rls', checksum: '545fdd984b983af2c4a92b8ce12cc97c31271cfd3ee0119f5acfd04eccba39f9' },
  { version: '012_search_indexes', checksum: '7e2c505d22c3746ebbc9d4078df8e49723b45122eb9257a56ca7f9dc0720ed60' },
  { version: '013_projects_add_surveyor_country', checksum: '0905c04d9b2b960f992f7007f835bb9880b7b5712be2898506c3cf4797491f1d' },
  { version: '014_entity_trigger_uuid_fix', checksum: '282893a379d8caea8c1b996923bfe0e40ca628c9f072f4b0f7c226235098cb0e' },
  { version: '015_fieldbook_soft_delete_audit', checksum: 'b7487d89b96faeea94b17666c229d094ffbf8c4bf50b46d629c88c26e2e1cebf' },
  { version: '016_oauth_provider', checksum: 'd4f5807c45befc40f7ec27bf9fdda93fb54b8b960d1d639cebafd69eaf7f0913' },
  { version: '017_version_fieldbook_entries', checksum: '208caa79b562b39b5ec3074f81f59e9bd3034d5d4f7522392a821b9fbb32a37b' },
  { version: '018_company_logos', checksum: '98013ecde460dc74dd237ee812ee9e17a9f62bcc31c8334913457775cac19737' },
  { version: '019_notifications_activity', checksum: '3593869e9c4ef025d43b311df5886642cb535f3d7bc68f1332df3a56a4154433' },
  { version: '020_beacon_equipment', checksum: '1eccb4b410a2b65b24b8a5e649e7d3483c6e275ee2af771c846dc6af01bc3f83' },
  { version: '021_field_records', checksum: 'd785cee92defe277945a3438808201868cb9bcf305746763daabe1881463405d' },
  { version: '022_profile_notification_preferences', checksum: 'bfa258352008b6e3aeca36fcf8c5ca0b7310da8533ec1fddc53ec4063e428bb4' },
  { version: '023_drop_mining_hydro_tables', checksum: '02e5a6a0781aa76c792291abc071e1eb332fe5a970a04e3df4a21db1b55b2186' },
  { version: '024_audit_chain', checksum: '8d009b90b9e320724024a09120d4472f43eee8ed77e6ee4449ae4733471ebba5' },
  { version: '025_survey_points_control_flag', checksum: '6f47d798747301914e5e5b8e510b4de32d687ee7ca728d36b7edc96d84391bc0' },
  { version: '026_mpesa_payment_flow_fix', checksum: '02f5c46028131de8c320d4c134434e858a18364081609bf31ef0fa56bc63d7be' },
  { version: '027_survey_points_crs_accuracy_provenance', checksum: '1e610606bd05b3bb0f90d9ce99fdc23fb90ef2a80c17c66de1e0c47fa02d4c90' },
  { version: '028_organizations_rls', checksum: 'ddf79f2c9109f5a1d62c3258ed329719c1852dcb4205d7151c2a2a223cd5a0b0' },
  { version: '029_extend_rls_all_tables', checksum: '073bbbfa720c0c24380caf8db9f4492c5adf0101b79b1ad1fbd44fa526ce0e4b' },
  { version: '030_onboarding_flag', checksum: 'e86f1a4294a75c278605e6dd5a7b6669ef949954eb68aa71c85a75294c02ade2' },
  { version: '031_subscription_columns', checksum: 'cd906861797e05d6bc6e8ef3ade311e523619b610386676ae65d52f5357cf82e' },
  { version: '032_fieldbooks_table', checksum: 'f262d0b43254f2cc114b627f183a43132eec82edb4c3a5587362b33931b9a574' },
  { version: '033_marketplace_tables', checksum: 'cfe3c4740d77081438903f2413257a6e079e9abc7b3b55f1bd7308c3dcc2d333' },
  { version: '034_document_signatures', checksum: '30adbbc701e0a4fb7f32c60fa1463bd33bfbe4c7c7118ba24519069ea287f3e3' },
  { version: '035_consolidated_missing_tables', checksum: '99301272018b97e948e8feb8ba2490f4b056a8033f3759d9711a641c0b074946' },
  { version: '036_engineering_table_columns', checksum: '854d2a48fca623839439764fbf76a42f3c2ec7e1fd007abad8050c2f14592581' },
  { version: '037_projects_cryptographic_seal', checksum: '5daec0078333b4a94f63a0ee3cfd141ae06547a84386490137ddd30e15a42d18' },
  { version: '038_professional_memberships', checksum: '2e842297a5075cefaec23187e28fa404f6c59576efe51a7568226a6d215d67ba' },
  { version: '039_cpd_fraud_prevention', checksum: 'f9d834855579ed206f63d92ad95b0cce9ec169b30473d8f287af67c4de050505' },
  { version: '040_feedback_table', checksum: '002aff0ea6fe8bae85cee38ad3501dcec434d1dd362798e79433ffe7ac48b662' },
  { version: '041_drone_processing_tasks', checksum: 'fc7594b3d212339c531cb94ebf2cd698f0f0c19abf238b3da4f314ca75b0b930' },
  { version: '042_beacon_quality_columns', checksum: '9d555f28d33e7ac7915a3ac1276075f8371dfaa137d4aa4b5a8612ee97786693' },
  { version: '043_db_best_practices_rectification', checksum: 'b449cfc2a4e0285e092f38fcc5e63a9f828a4d20968588496d7bf8f59053c8b5' },
  { version: '044_boundary_monuments', checksum: '97aef89e4af85c3f770c8bc3207a60b3ca3dd9725828371682da52b06eb3dfed' },
  { version: '045_corridor_control_networks', checksum: 'e05ac0646ff7a59fef41f07529d9f71e45bc2340358ce64265d22090cc3c9bcb' },
  { version: '045_session_revocation', checksum: '02095e9c04b3847af63c9672e4ce03a2efbdfbd44628978855c5f0acb52db7a1' },
  { version: '046_control_point_verifications', checksum: 'c28e22d0d759b3c2a4974731cf8800fbc4745f98d95c812e439e8f108cae8caa' },
  { version: '047_fix_audit_logs_record_id_type', checksum: 'e0102df98dd86b9e91ec15294a2a4f25df95b855d36ec0c48ca3b6c55aec9488' },
  { version: '047_project_submissions', checksum: '0064aa3274ef99be1ffe2758d5e1d38ff9af0ed9677ff8a864ec89c0d6e76187' },
  { version: '048_submission_schema_reconciliation', checksum: '869b782d2dabe8803d6d086c3008eb45c3cdde1c2f584eaae8360478ced24caf' },
  { version: '048_trial_reminder', checksum: '1dc5c04862505a3acb95b180b367d1ce81a201cf9ab2c81f1dd83d913597baad' },
  { version: '049_trial_final_reminder', checksum: '9d0af45db3945d18bc8888feef1791aee3441532a574b6d426b260dcd5377d6b' },
  { version: '049_workflow_progress_columns', checksum: 'fee85d9e66babd3d1f99f8776efe37a1e316a665352deeba4d87a9121d0b76a7' },
  { version: '050_deed_plans_schema_alignment', checksum: 'c676d75c68d20ca991011f4e72e647ddef3bb48a679a632fc8953bf430afc44d' },
  { version: '050_projects_workflow_step', checksum: '81f3e29494b09ea403dae2c95f9e7deec1ec98a28a80fb69dab917b13111020e' },
  { version: '052_schema_drift_reconciliation', checksum: '1b7bcc2e314ee10efa4bdf324738c49b7c05311932e86ed9a566167e1a5756fc' },
  { version: '053_community_marketplace_reconciliation', checksum: 'e0b266c2c7e7913f23b9a8430a97cfb2bf5b604d516f77e84beb786634d14a57' },
  { version: '054_ghost_row_purge', checksum: '7486f9cf5f97249cf2581e9e6918bbbf9894310d8190a080e0dc963604cd025f' },
  { version: '055_payment_history_provider_id_unique', checksum: '746191a0141dbb6ac3ff1eb12028df6def7b3f6d6d6cb932d63eb4e4332d9f10' },
  { version: '056_users_email_verified', checksum: '83fc1566abb9da152ac2caa2bf5b122cf6a2d3e6e8e02d03c904bc0a6db60365' },
  { version: '057_background_jobs_created_by', checksum: 'f52632d81ee00a65ec8031ac30249291de9db3f883ff88f389cdfe3818ce8fee' },
  { version: '058_payment_history_updated_at', checksum: '3da9e5e039c32eaa5cd4d98b52e0ed901e738ec88b92b80d6dc7f8de432d03d9' },
  { version: '059_reconcile_migration_checksums', checksum: 'c6537f35a89fb5e84ef12be221092e00695a86b3b19c8f694f77b64582c5ad76' },
  { version: '060_reconcile_checksums_000_029', checksum: 'd856e23fe11e30ba0c1f0890c42328830f84787cfa6e6defa46fb18f436e229e' },
  { version: '061_subscription_seat_count', checksum: 'ecdc341aa7d5460ddc21f3e23a47aac732daf875ecc9819bf2074cfc51cd760b' },
  { version: '062_submission_document_tracking', checksum: '68327e08fb0a1733976d02ceb3e0cf31f9eab32440e49e6adb8dab1bbe9dd0b0' },
  { version: '063_survey_report_content', checksum: 'dce1d9837c4291ebf1bd07b9d9bd3b9d3d2fbaa08769c5b84b58022884a1f353' },
  { version: '064_project_settings_fields', checksum: '152e67e043cfad39c2267c7a695933559d5e3ac26089eb0498a084b3723892e7' },
  { version: '065_project_reference_systems', checksum: 'ae1634f6f097c86babab2ee73ed2c45e60732621dcaaf280a959a92fd97a9432' },
  { version: '066_drop_project_crs_defaults', checksum: '3317d0e57731a02ec877074ae8f4aa0c4c37fb32ee5fefe45ddca135641dd65d' },
  { version: '067_equipment_calibration_logs', checksum: '8944e463e288493433eaae19db51e2907b3117ddcec5b0143444a86098807831' },
  { version: '068_background_jobs_and_observation_batches', checksum: 'b4cb5d32a6ea2db118322d734ce9734abc941742bd9abf8b0cfacb2d3c542c30' },
  { version: '069_marketplace_listing_types', checksum: '4c485f83018c0e42406d78bb022133fa4e6f188927ed7f63db06dcec29be6766' },
  { version: '070_observation_batch_raw_immutability', checksum: '2ae45a330be40467cd5227f0772fd53d49bb48a0e0e7f4b71aacfa82e061f8ed' },
  { version: '071_parcel_import_project_crs', checksum: 'eed3a053018ece6c4fb8a1a717f695a2491be9009fcd237e16f60f003fc8172e' },
  { version: '072_deliverables_computations_qa', checksum: 'eb01f528191395e14439814458ad2a04d42f200a09660a7e827bf9c8066e18e0' },
  { version: '073_engineering_schema_and_beacon_reestablishment', checksum: '314f586db7e6048433fb4e9d3e083d272a920d65962de9e5cd2bebab67d3873f' },
  { version: '074_topo_surface_persistence', checksum: 'be53573bb94fdc7ff7e2514b5d90b9176809afdbaa98b60e254c43e1db06bb08' },
  { version: '075_setout_and_verticality', checksum: '2a99e2a9d2a83b311b796bb24341193143c27114fd10d25f61c7849ea5a9eb32' },
  { version: '076_design_revisions_and_offline_basemaps', checksum: '1e355878e1c5b3c45c1ac091dedb5d326234e3435ee4e41c97f4f9bbacc169ea' },
  { version: '077_chatgpt_oauth', checksum: 'e965ca213985777b95366abe1139b216387bdec82f145b52d95f3626bac50817' },
  { version: '078_offline_field_photos', checksum: '55386cdb31e9fab4240ceddc627b0dea448e5062d852b6a846d929e584ca4366' },
  { version: '079_chatgpt_survey_tools_scopes', checksum: 'b906059fb430e0526683de9c31ece881f144d4b129c18458b50b52a4a20d8565' },
  { version: '080_chatgpt_draft_report_scope', checksum: 'ba65212bdf7d6630c6668711d35ee1ec80f5aab872d3bc2ffd48a75de3e4d415' },
  { version: '081_user_session_version', checksum: 'c3cd8655db28d4376aeebc6d1e20669fe2b87b5601d0a75021e9ebb8fe731955' },
  { version: '082_offline_basemap_storage_keys', checksum: '221c389ce2e5972c1cc8c03717d1a8590858f9e64ca2f31a3865ea8f252fdf3f' },
  { version: '083_field_records_explicit_crs', checksum: '064049e0fcb15113f96ed08f5419a9d4a9fbba805ab28c470a27dcf1b05c31d0' },
  { version: '084_project_engineering_data', checksum: 'e19bf6eeabd6aa2a29a01940d1411d4995f2bac2f7535cd5f2e1111adf0f62e9' },
  { version: '085_setout_source_metadata', checksum: '97ff4e9492bd795bed63ab9d599711f938ff69c5fb47b5564ca2ca1f2357d76b' },
  { version: '086_organization_invitations_and_rls', checksum: '3971c68f8204c7d6d5f35b0d3a8e6d9995631286175858d5b8d80f2829eb6d41' },
  { version: '087_reported_setout_accuracy', checksum: 'd67ff259246d7906e04ffad1d28b8363b62c1bc30f942ae03f55285aa0fe4373' },
  { version: '088_setout_shot_idempotency', checksum: '990ca0fca0f68d8897f002c18fc34a47290c7dcbbca06ad88a1e86d911ed0656' },
  { version: '089_setout_project_rls', checksum: '58d7fb616e75767ebea7334abf5adbd4fe71f3312a0a378ab883c10a07edf1f9' },
  { version: '090_payment_runtime_rls', checksum: 'fbbae7de43480191dc706ee9ddffea053b6e7ce6ce842d059a0d474c83875af3' },
  { version: '091_beacon_runtime_rls', checksum: '4534fb87bfac727a8fd4158622cd3d78b7203618bd5f2db6b2b817dc7e59fc06' },
  { version: '092_admin_project_read_rls', checksum: '69bf8d05d676e3e16424258e0d1215852af40e2c415789a2ceb4e7e860695010' },
  { version: '093_instrument_observation_provenance', checksum: '6ab65cb6a11afe44b908ea50606b8fb58d8387f033ccf4c06d2ba06349c8a23f' },
  { version: '094_organization_project_role_revocation', checksum: 'e63e9a26b5c461e43131b045a2f6c2a8ff19ceead6dc52ffd94dc15cdab9dce8' },
  { version: '095_design_revision_lifecycle', checksum: 'b48a861d225d201c794a2fcf927b0e7441588b3f2a064cb5f62fa89ea224e73a' },
  { version: '096_setout_capture_snapshots', checksum: 'ff47a546a2253f04235bad43fb0e46268d10df7fe339d75feaa945d2f815e2d8' },
  { version: '097_fieldbook_runtime_audit', checksum: 'be959e04ba2fe0962a1b6e9d3d656f57b72f38aa1101f1a1edd7d0b815eefcc1' },
  { version: '098_account_suspension_revocation', checksum: '7ed68a2aa341300ae93560e2febeef8d0552549b443050f8888f5bd4389b91d1' },
  { version: '099_authenticated_audit_append', checksum: '1f791b06025aa973293173d5f75f018183e0dce84e932f8fdee3aca49e2ec2b9' },
  { version: '100_beacon_reestablishment_evidence', checksum: '337786bfd15a19d06ab2e1cf7893cac36b161a0da209052ae4916d4a68463b7f' },
  { version: '101_public_control_catalog', checksum: '9410e443c498a08d110a9d1aefc37988c6d20f22b8a66b8de280cdc0356ff973' },
  { version: '102_control_import_coordinate_precision', checksum: 'd4f67317cbb0042914332489aeaa02f5165f91e0b81080e48d9ba3a87436d9d6' },
  { version: '103_field_control_checks', checksum: '9e2e1b7d2f774d4f177b346b3695503cee48024449cb688df8bd9b5db468fae4' },
  { version: '104_imported_control_delete_guard', checksum: 'ff662de1916f48b511c32c9c1fa81344a2248dff83a9eed311f8db9e19412511' },
  { version: '105_marketing_email_deliveries', checksum: 'a3bfebbc45b739cb7d35fdac9f0ab3595a23aab5aa0913f74cd473d86ccb74aa' },
  { version: '106_setout_capture_v2', checksum: '7f3639e473bf85d9e910347fe3f9d7efd31fe1211029a64284cba5d52a57f519' },
  { version: '107_verticality_capture_evidence', checksum: '9c320835fd70b10e4c817b0c5cb22815d3ebc2076649def2acaf2f3bd4faa052' },
  { version: '108_pipeline_asbuilt_history', checksum: '25466f5f6deb9f5f92a1ef80375b8f14c80f4078d4b16ac923fda75e1f8d6837' },
  { version: '109_surveyor_profile_privileges', checksum: 'baab2118c9547af6c5ac9d72847fc55f6ce8339e8070c303150c01de8cda3c54' },
  { version: '110_alignment_input_persistence', checksum: '671ead72283c8408a5b79d04d1bae64ff48507be48f7bb95555c2a8963f4527a' },
  { version: '111_personal_project_reader_rls', checksum: 'ac4a6ec02bcfb5cc1879fe6ec3d0384f9a8b1926d67416b1100190e400f211b5' },
  { version: '112_project_reader_snapshot_lock', checksum: '45d636fa0e105b5a28169fb2c730f4fbfba29c7842fe53599fa5464281b1ee2a' },
  { version: '113_observation_batch_compatibility', checksum: '66b941765702aff8dafad90504ccc11ffa5e469013ab861537def60cc92d06d9' },
  { version: '114_field_observation_roles', checksum: 'b6af0035a6d81ca9f5dd14b667b711d4b24ac81465de148f009ac8416b25b50d' },
]

function walkFiles(dir, predicate, results = []) {
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git' || entry === '.cache' || entry === '.freebuff') {
      continue
    }
    const full = join(dir, entry)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      walkFiles(full, predicate, results)
    } else if (predicate(full)) {
      results.push(full)
    }
  }
  return results
}

const failures = []

// ─── 1. Applied SQL Migration Immutability ───────────────────────────────────
const migrationsDir = join(ROOT, 'src', 'lib', 'db', 'migrations')
const sourceMigrations = collectFileMigrations(migrationsDir)
const drift = computeDrift(sourceMigrations, APPLIED_PRODUCTION_LEDGER)

for (const mutated of drift.mutated) {
  failures.push(
    `[MIGRATION_MUTATED] src/lib/db/migrations/${mutated.version}.sql was modified after production application (expected ${mutated.stored.slice(0, 12)}…, got ${mutated.actual.slice(0, 12)}…). Add a new migration instead.`
  )
}
for (const ghost of drift.ghost) {
  failures.push(
    `[MIGRATION_DELETED] Applied production migration src/lib/db/migrations/${ghost}.sql is missing from disk.`
  )
}

// ─── 2. /api/db Proxy Security & Raw Observation Invariants ──────────────────
const dbRoutePath = join(ROOT, 'src', 'app', 'api', 'db', 'route.ts')
if (!existsSync(dbRoutePath)) {
  failures.push('[DB_PROXY_MISSING] src/app/api/db/route.ts is missing.')
} else {
  const dbRoute = readFileSync(dbRoutePath, 'utf8')
  const requiredSnippets = [
    {
      check: dbRoute.includes("'password_reset_tokens'") && dbRoute.includes("'users'") && dbRoute.includes('FORBIDDEN_TABLES'),
      msg: 'src/app/api/db/route.ts must keep password_reset_tokens and users in FORBIDDEN_TABLES.',
    },
    {
      check: dbRoute.includes("table === 'survey_observations' && operation !== 'select'") && dbRoute.includes('RAW_OBSERVATION_CAPTURE_REQUIRED'),
      msg: 'src/app/api/db/route.ts must block non-select operations on survey_observations (RAW_OBSERVATION_CAPTURE_REQUIRED).',
    },
    {
      check: dbRoute.includes("table === 'surveyor_profiles' && !isSafeSurveyorProfileWrite(operation, payload)"),
      msg: 'src/app/api/db/route.ts must enforce isSafeSurveyorProfileWrite on surveyor_profiles writes.',
    },
    {
      check:
        dbRoute.includes('setAuthenticatedDatabaseContext(null)') &&
        dbRoute.includes('setCurrentRlsServiceRole(null)') &&
        dbRoute.includes('setCurrentTillClaimCode(null)'),
      msg: 'src/app/api/db/route.ts must reset RLS context before handling each request.',
    },
    {
      check:
        dbRoute.includes('delete sanitized.id') &&
        dbRoute.includes('delete sanitized.user_id') &&
        dbRoute.includes('delete sanitized.project_id'),
      msg: 'src/app/api/db/route.ts must strip id, user_id, and project_id on update payloads.',
    },
  ]
  for (const item of requiredSnippets) {
    if (!item.check) failures.push(`[DB_PROXY_INVARIANT] ${item.msg}`)
  }
}

// ─── 3. Next.js & PWA Field-Safety Invariants ────────────────────────────────
const nextConfigPath = join(ROOT, 'next.config.js')
if (existsSync(nextConfigPath)) {
  const nextConfig = readFileSync(nextConfigPath, 'utf8')
  if (/ignoreBuildErrors\s*:\s*true/.test(nextConfig) || !/ignoreBuildErrors\s*:\s*false/.test(nextConfig)) {
    failures.push('[NEXT_CONFIG] next.config.js must enforce ignoreBuildErrors: false.')
  }
  if (!/reloadOnOnline\s*:\s*false/.test(nextConfig) || !/skipWaiting\s*:\s*false/.test(nextConfig) || !/clientsClaim\s*:\s*false/.test(nextConfig)) {
    failures.push('[PWA_SAFETY] next.config.js must preserve reloadOnOnline: false, skipWaiting: false, and clientsClaim: false.')
  }
}

// ─── 4. Test Global WebCrypto Pollution Guard ────────────────────────────────
const testFiles = [
  ...walkFiles(join(ROOT, 'src'), (f) => /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(f)),
  ...walkFiles(join(ROOT, 'tests'), (f) => /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(f)),
]
for (const file of testFiles) {
  const content = readFileSync(file, 'utf8')
  const mutatesRandomUuid =
    /crypto\.randomUUID\s*=/.test(content) ||
    /defineProperty\([^)]*crypto[^)]*,\s*['"]randomUUID['"]/.test(content)
  if (mutatesRandomUuid) {
    const restoresRandomUuid =
      /getOwnPropertyDescriptor\([^)]*crypto[^)]*,\s*['"]randomUUID['"]\)/.test(content) ||
      /originalRandomUUID/.test(content)
    if (!restoresRandomUuid) {
      failures.push(
        `[TEST_ISOLATION] ${relative(ROOT, file)} mutates crypto.randomUUID without saving/restoring its property descriptor.`
      )
    }
  }
}

// ─── 5. Hardcoded Live Credentials & Private Key Guard ───────────────────────
const secretScanFiles = [
  ...walkFiles(join(ROOT, 'src'), (f) => /\.(ts|tsx|js|mjs|json)$/.test(f)),
  ...walkFiles(join(ROOT, 'scripts'), (f) => /\.(ts|js|mjs|sh|py)$/.test(f)),
  ...walkFiles(join(ROOT, '.github'), (f) => /\.(yml|yaml)$/.test(f)),
  join(ROOT, 'docker-compose.yml'),
].filter((f) => existsSync(f) && relative(ROOT, f).replace(/\\/g, '/') !== 'scripts/security-and-bug-gate.mjs')

const LIVE_SECRET_PATTERNS = [
  { name: 'Google OAuth Client Secret', regex: /GOCSPX-[A-Za-z0-9_-]{20,}/ },
  { name: 'Stripe Live Secret Key', regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'Resend Live API Key', regex: /\bre_[A-Za-z0-9_]{24,}\b/ },
  { name: 'PEM Private Key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
]

for (const file of secretScanFiles) {
  const content = readFileSync(file, 'utf8')
  for (const pattern of LIVE_SECRET_PATTERNS) {
    if (pattern.regex.test(content)) {
      failures.push(
        `[LIVE_SECRET_EXPOSED] ${relative(ROOT, file)} matches ${pattern.name} pattern.`
      )
    }
  }
}

if (failures.length > 0) {
  console.error('security-and-bug-gate: FAILED with the following violation(s):')
  for (const failure of failures) {
    console.error(`  ✗ ${failure}`)
  }
  process.exit(1)
}

console.log(
  `security-and-bug-gate: OK (${APPLIED_PRODUCTION_LEDGER.length} applied migrations pinned, /api/db & PWA guards verified, ${testFiles.length} test files & ${secretScanFiles.length} source files scanned).`
)
