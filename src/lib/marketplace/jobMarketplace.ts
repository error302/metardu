/**
 * Survey Job Marketplace
 * Phase 9 - Community Features
 * Job board for surveyors with 5% commission
 */

export interface SurveyJob {
  id: string
  title: string
  description: string
  clientName: string
  clientId: string
  country: string
  location: string
  surveyType: 'boundary' | 'topographic' | 'engineering' | 'mining' | 'hydrographic' | 'drone' | 'cadastral' | 'control_network'
  budget: number
  currency: string
  deadline: number
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  postedAt: number
  proposals: number
  requiredSkills: string[]
  projectDocuments?: string[]
}

export interface JobProposal {
  id: string
  jobId: string
  surveyorId: string
  surveyorName: string
  surveyorRating: number
  proposedAmount: number
  currency: string
  coverLetter: string
  estimatedDuration: string
  submittedAt: number
  status: 'pending' | 'accepted' | 'rejected'
}

export interface JobCommission {
  jobId: string
  jobTitle: string
  amount: number
  currency: string
  commissionRate: number
  commissionAmount: number
  status: 'pending' | 'paid' | 'refunded'
  paidAt?: number
}

const jobs: SurveyJob[] = [
  {
    id: 'job-001',
    title: 'Residential Subdivision Survey',
    description: 'Need a surveyor to conduct boundary survey for a 5-acre residential subdivision in Karen, Nairobi. 12 plots to be surveyed.',
    clientName: 'Karen Development Ltd',
    clientId: 'client-001',
    country: 'Kenya',
    location: 'Karen, Nairobi',
    surveyType: 'cadastral',
    budget: 150000,
    currency: 'KES',
    deadline: Date.now() + 30 * 24 * 60 * 60 * 1000,
    status: 'open',
    postedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    proposals: 5,
    requiredSkills: ['Boundary Surveys', 'Subdivision', 'Kenya Land Registry'],
  },
  {
    id: 'job-002',
    title: 'Topographic Survey for Road Design',
    description: '2km road corridor topographic survey needed. Requires detail survey with contours at 0.5m interval.',
    clientName: 'Ministry of Roads',
    clientId: 'client-002',
    country: 'Uganda',
    location: 'Kampala-Entebbe Road',
    surveyType: 'topographic',
    budget: 85000,
    currency: 'USD',
    deadline: Date.now() + 45 * 24 * 60 * 60 * 1000,
    status: 'open',
    postedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    proposals: 3,
    requiredSkills: ['Topographic Survey', 'DTM Generation', 'Road Design'],
  },
  {
    id: 'job-003',
    title: 'Hydrographic Survey for Port Extension',
    description: 'Bathymetric survey for proposed port extension in Dar es Salaam. Area: 50 hectares, depth range 5-25m.',
    clientName: 'Tanzania Ports Authority',
    clientId: 'client-003',
    country: 'Tanzania',
    location: 'Dar es Salaam Port',
    surveyType: 'hydrographic',
    budget: 120000,
    currency: 'USD',
    deadline: Date.now() + 60 * 24 * 60 * 60 * 1000,
    status: 'open',
    postedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    proposals: 2,
    requiredSkills: ['Hydrographic Survey', 'Bathymetry', 'Marine Surveys'],
  },
  {
    id: 'job-004',
    title: 'Control Network Establishment',
    description: 'Establish GPS control network for mining project. 20 points across 1000ha area.',
    clientName: 'African Mining Corp',
    clientId: 'client-004',
    country: 'Ghana',
    location: 'Ashanti Region',
    surveyType: 'control_network',
    budget: 95000,
    currency: 'USD',
    deadline: Date.now() + 21 * 24 * 60 * 60 * 1000,
    status: 'open',
    postedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
    proposals: 4,
    requiredSkills: ['GNSS', 'Control Networks', 'Least Squares'],
  },
  {
    id: 'job-005',
    title: 'Drone Survey for Construction Site',
    description: 'Aerial survey of 20-acre construction site. Need orthomosaic, DSM, and volume calculations.',
    clientName: 'BuildTech Kenya',
    clientId: 'client-005',
    country: 'Kenya',
    location: 'Mombasa Road, Nairobi',
    surveyType: 'drone',
    budget: 75000,
    currency: 'KES',
    deadline: Date.now() + 14 * 24 * 60 * 60 * 1000,
    status: 'open',
    postedAt: Date.now() - 4 * 24 * 60 * 60 * 1000,
    proposals: 7,
    requiredSkills: ['UAV Survey', 'Photogrammetry', 'Volume Calculation'],
  },
]

const proposals: JobProposal[] = []
const commissions: JobCommission[] = []
const COMMISSION_RATE = 0.05 // 5%

export function getJobs(filters?: {
  country?: string
  surveyType?: string
  status?: string
}): SurveyJob[] {
  let result = [...jobs]
  
  if (filters?.country) {
    result = result.filter(j => j.country.toLowerCase() === filters.country?.toLowerCase())
  }
  if (filters?.surveyType) {
    result = result.filter(j => j.surveyType === filters.surveyType)
  }
  if (filters?.status) {
    result = result.filter(j => j.status === filters.status)
  }
  
  return result.sort((a, b) => b.postedAt - a.postedAt)
}

export function getJobById(jobId: string): SurveyJob | undefined {
  return jobs.find(j => j.id === jobId)
}

export function searchJobs(query: string): SurveyJob[] {
  const q = query.toLowerCase()
  return jobs.filter(j => 
    j.title.toLowerCase().includes(q) ||
    j.description.toLowerCase().includes(q) ||
    j.location.toLowerCase().includes(q) ||
    j.country.toLowerCase().includes(q)
  )
}

export function postJob(
  title: string,
  description: string,
  clientName: string,
  clientId: string,
  country: string,
  location: string,
  surveyType: SurveyJob['surveyType'],
  budget: number,
  currency: string,
  deadline: number,
  requiredSkills: string[]
): SurveyJob {
  const job: SurveyJob = {
    id: `job-${Date.now()}`,
    title,
    description,
    clientName,
    clientId,
    country,
    location,
    surveyType,
    budget,
    currency,
    deadline,
    status: 'open',
    postedAt: Date.now(),
    proposals: 0,
    requiredSkills,
  }
  
  jobs.push(job)
  return job
}

export function submitProposal(
  jobId: string,
  surveyorId: string,
  surveyorName: string,
  surveyorRating: number,
  proposedAmount: number,
  currency: string,
  coverLetter: string,
  estimatedDuration: string
): JobProposal {
  const proposal: JobProposal = {
    id: `prop-${Date.now()}`,
    jobId,
    surveyorId,
    surveyorName,
    surveyorRating,
    proposedAmount,
    currency,
    coverLetter,
    estimatedDuration,
    submittedAt: Date.now(),
    status: 'pending',
  }
  
  proposals.push(proposal)
  
  const job = jobs.find(j => j.id === jobId)
  if (job) job.proposals++
  
  return proposal
}

export function getProposalsForJob(jobId: string): JobProposal[] {
  return proposals.filter(p => p.jobId === jobId)
}

export function acceptProposal(proposalId: string): boolean {
  const proposal = proposals.find(p => p.id === proposalId)
  if (!proposal) return false
  
  proposal.status = 'accepted'
  
  const job = jobs.find(j => j.id === proposal.jobId)
  if (job) {
    job.status = 'in_progress'
    
    const commissionAmount = proposal.proposedAmount * COMMISSION_RATE
    commissions.push({
      jobId: job.id,
      jobTitle: job.title,
      amount: proposal.proposedAmount,
      currency: proposal.currency,
      commissionRate: COMMISSION_RATE,
      commissionAmount,
      status: 'pending',
    })
  }
  
  proposals.forEach(p => {
    if (p.id !== proposalId && p.jobId === proposal.jobId) {
      p.status = 'rejected'
    }
  })
  
  return true
}

export function completeJob(jobId: string): boolean {
  const job = jobs.find(j => j.id === jobId)
  if (!job) return false
  
  job.status = 'completed'
  
  const comm = commissions.find(c => c.jobId === jobId)
  if (comm) {
    comm.status = 'paid'
    comm.paidAt = Date.now()
  }
  
  return true
}

export function getCommissions(): JobCommission[] {
  return commissions
}

export function getTotalCommissionEarned(): number {
  return commissions
    .filter(c => c.status === 'paid')
    .reduce((sum, c) => sum + c.commissionAmount, 0)
}

export function getJobCategories() {
  return [
    { id: 'boundary', name: 'Boundary Survey', icon: '📐' },
    { id: 'topographic', name: 'Topographic Survey', icon: '🏔' },
    { id: 'engineering', name: 'Engineering Survey', icon: '🏗' },
    { id: 'mining', name: 'Mining Survey', icon: '⛏' },
    { id: 'hydrographic', name: 'Hydrographic Survey', icon: '🌊' },
    { id: 'drone', name: 'Drone/UAV Survey', icon: '🚁' },
    { id: 'cadastral', name: 'Cadastral Survey', icon: '🏠' },
    { id: 'control_network', name: 'Control Network', icon: '📡' },
  ]
}

export function getCountries() {
  return ['Kenya', 'Uganda', 'Tanzania', 'Ghana', 'Nigeria', 'South Africa']
}
