import { z } from 'zod'

const receiptSchema = z.object({
  requestId:z.string().uuid(),batchId:z.string().uuid(),
  sourceFileHash:z.string().regex(/^[a-f0-9]{64}$/),inputHash:z.string().regex(/^[a-f0-9]{64}$/),
  imported:z.number().int().positive(),pointIds:z.array(z.string().uuid()),
  replayed:z.boolean(),fieldVerified:z.literal(false),
})
export type PointImportReceipt=z.infer<typeof receiptSchema>
export function validatePointImportReceipt(value:unknown,expected:{requestId:string;sourceFileHash:string;selectedIndices:number[]}):PointImportReceipt {
  const parsed=receiptSchema.safeParse(value)
  if(!parsed.success)throw new Error('No complete import receipt was received. Retry the same capture to check its status.')
  const receipt=parsed.data
  if(receipt.requestId!==expected.requestId||receipt.sourceFileHash!==expected.sourceFileHash||receipt.imported!==expected.selectedIndices.length||receipt.pointIds.length!==receipt.imported||new Set(receipt.pointIds).size!==receipt.imported)throw new Error('The import receipt does not match the selected capture. Retry the same capture to check its status.')
  return receipt
}
