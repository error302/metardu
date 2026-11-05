import {compareEpochs,type EpochSet,type MonumentObservation} from '../deformationMonitoring'

const point=(monumentId:string,changes:Partial<MonumentObservation>={}):MonumentObservation=>({monumentId,latitude:-1,longitude:37,height:100,
  frame:'ITRF2014',epoch:2026,sigmaE:0.001,sigmaN:0.001,sigmaH:0.001,...changes})
const epoch=(monuments:MonumentObservation[]):EpochSet=>({label:'Synthetic test epoch',epoch:2026,monuments})
const tolerance={horizontal:0.005,vertical:0.003}

describe('monitoring completeness cannot imply a whole-network safety result',()=>{
  it('is inconclusive if a baseline monument was not reobserved',()=>{
    const report=compareEpochs(epoch([point('DM-1'),point('DM-2')]),epoch([point('DM-1')]),tolerance)
    expect(report.verdict).toBe('INCONCLUSIVE')
    expect(report.summary).toContain('DM-2')
    expect(report.missingMonuments).toEqual(['DM-2'])
    expect(report.vectors).toHaveLength(1)
  })
  it('does not hide a real tolerance exceedance behind missing readings',()=>{
    const report=compareEpochs(epoch([point('DM-1'),point('DM-2')]),epoch([point('DM-1',{height:100.02})]),tolerance)
    expect(report.verdict).toBe('DEFORMING')
    expect(report.alerts).toHaveLength(1)
    expect(report.summary).toContain('DM-2')
  })
  it('new monuments without a baseline do not become a whole-network stable verdict',()=>{
    const report=compareEpochs(epoch([point('DM-1')]),epoch([point('DM-1'),point('DM-new')]),tolerance)
    expect(report.verdict).toBe('INCONCLUSIVE')
    expect(report.summary).toContain('DM-new')
  })
  it('missing uncertainty is inconclusive even with zero observed displacement',()=>{
    const uncertain=point('DM-1',{sigmaE:undefined,sigmaN:undefined,sigmaH:undefined})
    const report=compareEpochs(epoch([uncertain]),epoch([uncertain]),tolerance)
    expect(report.verdict).toBe('INCONCLUSIVE')
    expect(report.summary).toMatch(/uncertainty/i)
    expect(report.vectors[0]?.significance).toBeUndefined()
  })
  it('partial horizontal-only uncertainty cannot clear the vertical result',()=>{
    const partial=point('DM-1',{sigmaH:undefined})
    expect(compareEpochs(epoch([partial]),epoch([partial]),tolerance).verdict).toBe('INCONCLUSIVE')
  })
  it('retains the measured-only threshold outcome for a complete comparison',()=>{
    const report=compareEpochs(epoch([point('DM-1')]),epoch([point('DM-1')]),tolerance)
    expect(report.verdict).toBe('STABLE')
    expect(report.summary).toMatch(/not.*structural safety/i)
  })
  it.each([NaN,Infinity,-1,0])('rejects invalid supplied standard deviation %p',sigmaE=>{
    expect(()=>compareEpochs(epoch([point('DM-1',{sigmaE})]),epoch([point('DM-1')]),tolerance)).toThrow(/uncertainty|standard deviation/i)
  })
  it('does not advertise unsupported confidence levels as exact statistical tests',()=>{
    expect(()=>compareEpochs(epoch([point('DM-1')]),epoch([point('DM-1')]),tolerance,0.8)).toThrow(/95|99|confidence/i)
  })
  it('uses supplied E-N covariance rather than silently treating it as zero',()=>{
    const latitude=-1+0.001/6371000*180/Math.PI
    const longitude=37+0.001/(6371000*Math.cos(-Math.PI/180))*180/Math.PI
    const baseline=epoch([point('DM-1',{sigmaEN:0.0000005})])
    const current=epoch([point('DM-1',{latitude,longitude,sigmaEN:0.0000005})])
    const report=compareEpochs(baseline,current,tolerance)
    expect(report.vectors[0]?.significance?.testStatistic).toBeCloseTo(Math.sqrt(2/3),5)
  })
  it('rejects non-positive-definite covariance rather than returning a passed test',()=>{
    expect(()=>compareEpochs(epoch([point('DM-1',{sigmaEN:0.000002})]),epoch([point('DM-1')]),tolerance)).toThrow(/covariance|uncertainty/i)
  })
  it('refuses to compare unaligned reference frames',()=>{
    expect(()=>compareEpochs(epoch([point('DM-1')]),epoch([point('DM-1',{frame:'ITRF2008'})]),tolerance)).toThrow(/reference frame/i)
  })
  it('pairs the vertical-only statistic with its own non-zero critical value',()=>{
    const partial=point('DM-1',{sigmaE:undefined,sigmaN:undefined})
    const report=compareEpochs(epoch([partial]),epoch([{...partial,height:100.001}]),tolerance)
    expect(report.verdict).toBe('INCONCLUSIVE')
    expect(report.vectors[0]?.significance?.criticalValue).toBeCloseTo(1.9599639845,8)
    expect(report.vectors[0]?.significance?.assessedDimensions).toEqual(['vertical'])
  })
})
