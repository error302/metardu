import { buildSetoutObservationPayload, type QueuedSetoutShot } from '../setoutQueue'

const shot: QueuedSetoutShot = {
  id: 'a8e31f2e-8f22-4cb8-a662-f5d5b18c2f30',
  projectId: 'project-1',
  definitionId: 'definition-1',
  label: 'DR-00003',
  observedEasting: 500000.003,
  observedNorthing: 9800000.002,
  observedRL: 99.502,
  accuracyM: 0.006,
  result: 'PASS',
  designEasting: 500000,
  designNorthing: 9800000,
  designRL: 99.5,
  designRevision: 4,
  capturedAt: '2026-10-07T08:30:00.000Z',
  synced: false,
  syncStatus: 'queued',
}

test('retries the exact device shot with a stable id and its captured design revision', () => {
  expect(buildSetoutObservationPayload(shot)).toEqual({
    action: 'record_observation',
    clientShotId: shot.id,
    definitionId: shot.definitionId,
    label: shot.label,
    observedEasting: shot.observedEasting,
    observedNorthing: shot.observedNorthing,
    observedRL: shot.observedRL,
    accuracyM: shot.accuracyM,
    designEasting: shot.designEasting,
    designNorthing: shot.designNorthing,
    designRL: shot.designRL,
    designRevision: shot.designRevision,
    capturedAt: shot.capturedAt,
    notes: `Field shot captured ${shot.capturedAt} (${shot.result})`,
  })
})

test('sends the device capture time and captured CRS as structured evidence', () => {
  expect(buildSetoutObservationPayload({ ...shot, capturedCrs: 'EPSG:21037' })).toMatchObject({
    capturedAt: shot.capturedAt, capturedCrs: 'EPSG:21037',
  })
})
