import { validatePointImportReceipt } from '../pointImportClient'

const requestId='33333333-3333-4333-8333-333333333333'
const expected={requestId,sourceFileHash:'a'.repeat(64),selectedIndices:[0,1]}
const receipt={requestId,batchId:requestId,sourceFileHash:expected.sourceFileHash,inputHash:'b'.repeat(64),imported:2,
  pointIds:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'],replayed:false,fieldVerified:false}
test('requires exact source, request and unique durable point IDs before showing success',()=>{
  expect(validatePointImportReceipt(receipt,expected)).toEqual(receipt)
  for(const change of [{requestId:'44444444-4444-4444-8444-444444444444'},{sourceFileHash:'c'.repeat(64)},
    {imported:1},{pointIds:[receipt.pointIds[0],receipt.pointIds[0]]},{fieldVerified:true},{replayed:undefined}]) {
    expect(()=>validatePointImportReceipt({...receipt,...change},expected)).toThrow(/receipt/i)
  }
})
test('a replay may refer to the original batch while acknowledging the current retry ID',()=>{
  expect(validatePointImportReceipt({...receipt,batchId:'55555555-5555-4555-8555-555555555555',replayed:true},expected).replayed).toBe(true)
})
