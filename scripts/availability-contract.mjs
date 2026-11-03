/** Read-only availability evidence; origin health alone is not public uptime proof. */
export function availabilityVerdict({revision,origin,publicHealth,routes,power}) {
  if (!/^[a-f0-9]{40}$/.test(revision??'')) throw new Error('A full expected application revision is required.')
  const reasons=[]
  const health=(probe)=>probe?.status===200 && probe?.healthStatus==='healthy'
  if (!health(origin)) reasons.push('origin-health-unverified')
  if (!health(publicHealth)) reasons.push('public-health-unverified')
  for (const [name,probe] of [['origin',origin],['public',publicHealth]]) if (health(probe)&&probe.releaseId!==revision) reasons.push(name+'-release-mismatch')
  const expected=new Map([['/',200],['/login',200],['/dashboard',307],['/equipment',307],['/admin',307]])
  for (const [path,status] of expected) {
    const found=routes?.filter(route=>route.path===path)??[]
    if(found.length!==1||found[0].status!==status) reasons.push('entry-route-unverified:'+path)
    else if(status===307){try{const destination=new URL(found[0].location,'https://metardu.space');if(destination.origin!=='https://metardu.space'||destination.pathname!=='/login'||destination.searchParams.get('next')!==path)reasons.push('entry-redirect-mismatch:'+path)}catch{reasons.push('entry-redirect-mismatch:'+path)}}
  }
  if(power?.required){
    if(![0,1].includes(power.lineStatus)||!Number.isInteger(power.activeSleepSeconds)||power.activeSleepSeconds<0)reasons.push('host-power-unverified')
    else if(power.activeSleepSeconds!==0)reasons.push('host-idle-sleep-enabled')
  }
  return {passed:reasons.length===0,reasons,observationOnly:true,continuousUptimeProven:false}
}
