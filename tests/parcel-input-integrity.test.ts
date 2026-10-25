import { CreateParcelSchema,UpdateParcelSchema } from '@/lib/validation/parcelInputs'
const block='11111111-1111-4111-8111-111111111111'
const base={block_id:block,parcel_number:'SYN-1'}

it('preserves an explicitly unknown area and trims the parcel identity before validation',()=>{
  expect(CreateParcelSchema.parse({...base,parcel_number:' SYN-1 ',area_ha:null}).area_ha).toBeNull()
  expect(CreateParcelSchema.safeParse({...base,parcel_number:'   '}).success).toBe(false)
})
it.each([0,-1,Infinity,NaN,0.0000001,1.1234567,1000000])('rejects an invalid or unrepresentable hectare area %s',area=>{
  expect(CreateParcelSchema.safeParse({...base,area_ha:area}).success).toBe(false)
})
it('normalizes ordinary floating-point noise to the declared six-decimal hectare quantum',()=>{
  expect(CreateParcelSchema.parse({...base,area_ha:0.1+0.2}).area_ha).toBe(0.3)
})
it('permits explicit clearing without treating omitted fields as cleared',()=>{
  const parsed=UpdateParcelSchema.parse({notes:null,area_ha:null,lr_number_confirmed:null})
  expect(parsed.notes).toBeNull();expect(parsed.area_ha).toBeNull();expect(parsed.lr_number_confirmed).toBeNull();expect(parsed.lr_number_proposed).toBeUndefined()
})
