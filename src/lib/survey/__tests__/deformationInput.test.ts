import {deformationComparisonSchema,readMonitoringEpoch} from '../deformationInput'
const point={monumentId:'DM-1',latitude:-1,longitude:37,height:100,frame:'ITRF2014',epoch:2026,sigmaE:0.001,sigmaN:0.001,sigmaH:0.001}
const epoch={label:'Synthetic epoch',epoch:2026,monuments:[point]}
const request={baseline:epoch,current:epoch,tolerance:{horizontal:0.005,vertical:0.003}}

describe('monitoring input boundary',()=>{
  it('accepts explicit monitoring criteria and defaults only statistical confidence',()=>{
    expect(deformationComparisonSchema.parse(request).confidenceLevel).toBe(0.95)
  })
  it('requires declared horizontal and vertical tolerance in HTTP requests',()=>{
    expect(deformationComparisonSchema.safeParse({baseline:epoch,current:epoch}).success).toBe(false)
    expect(deformationComparisonSchema.safeParse({...request,tolerance:{horizontal:0.005}}).success).toBe(false)
  })
  it.each([null,{}, {label:'broken',epoch:2026,monuments:'not-an-array'}])('rejects malformed epoch %p',value=>{
    expect(()=>readMonitoringEpoch(value)).toThrow(/monitoring/i)
  })
  it.each([{latitude:91},{longitude:181},{frame:'UNKNOWN'},{frame:'invented'},{sigmaE:NaN},{height:Infinity}])('rejects invalid observation %p',change=>{
    expect(()=>readMonitoringEpoch({...epoch,monuments:[{...point,...change}]})).toThrow(/monitoring/i)
  })
  it('rejects an unimplemented confidence level',()=>{
    expect(deformationComparisonSchema.safeParse({...request,confidenceLevel:0.8}).success).toBe(false)
  })
  it('rejects duplicate observations and unaligned reference frames at the HTTP boundary',()=>{
    expect(deformationComparisonSchema.safeParse({...request,baseline:{...epoch,monuments:[point,point]}}).success).toBe(false)
    expect(deformationComparisonSchema.safeParse({...request,current:{...epoch,monuments:[{...point,frame:'ITRF2008'}]}}).success).toBe(false)
  })
  it('rejects unusable variance and covariance at the HTTP boundary',()=>{
    expect(deformationComparisonSchema.safeParse({...request,baseline:{...epoch,monuments:[{...point,sigmaE:1e-300}]}}).success).toBe(false)
    expect(deformationComparisonSchema.safeParse({...request,baseline:{...epoch,monuments:[{...point,sigmaEN:0.000002}]}}).success).toBe(false)
  })
})


describe('recorded monument identifier compatibility',()=>{
  it('normalizes safe numeric identifiers and trims strings without changing source input',()=>{
    const numeric={...point,monumentId:101}
    const parsed=readMonitoringEpoch({...epoch,monuments:[numeric,{...point,monumentId:' DM-02 '},{...point,monumentId:'00101'}]})
    expect(parsed.monuments.map(value=>value.monumentId)).toEqual(['101','DM-02','00101'])
    expect(numeric.monumentId).toBe(101)
  })
  it('detects collisions after numeric and whitespace normalization',()=>{
    expect(()=>readMonitoringEpoch({...epoch,monuments:[{...point,monumentId:101},{...point,monumentId:' 101 '}]})).toThrow(/only once/i)
  })
  it.each([NaN,Infinity,Number.MAX_SAFE_INTEGER+1,0.5,true,{},[],null,''])('rejects unsafe or ambiguous identifiers %p',monumentId=>{
    expect(()=>readMonitoringEpoch({...epoch,monuments:[{...point,monumentId}]})).toThrow(/monitoring/i)
  })
  it('does not coerce coordinate strings while normalizing an identifier',()=>{
    expect(()=>readMonitoringEpoch({...epoch,monuments:[{...point,monumentId:101,latitude:'-1'}]})).toThrow(/monitoring/i)
  })
})
