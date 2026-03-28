export type JobType =
  | 'BOUNDARY_SURVEY'
  | 'TOPOGRAPHIC_SURVEY'
  | 'SUBDIVISION'
  | 'SETTING_OUT'
  | 'LEVELLING'
  | 'ROAD_DESIGN'
  | 'HYDROGRAPHIC'
  | 'DRONE_SURVEY'
  | 'EXPERT_WITNESS'
  | 'OTHER'

export type JobStatus =
  | 'OPEN'
  | 'AWARDED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PAID'
  | 'DISPUTED'
  | 'CANCELLED'

export interface JobBudget {
  amount: number
  currency: string
  type: 'FIXED' | 'NEGOTIABLE' | 'RATE_PER_ACRE' | 'RATE_PER_DAY'
  commissionAmount?: number
}

export interface SurveyJob {
  id: string
  postedBy: string
  title: string
  description: string
  jobType: JobType
  county: string
  constituency?: string
  locationDescription: string
  parcelNumber?: string
  estimatedArea?: number
  budget: JobBudget
  deadline: string
  requiredQualifications: string[]
  status: JobStatus
  awardedTo?: string
  completedAt?: string
  commissionPaid: boolean
  createdAt: string
  updatedAt: string
}

export type ApplicationStatus = 'PENDING' | 'SHORTLISTED' | 'AWARDED' | 'REJECTED'

export interface JobApplication {
  id: string
  jobId: string
  surveyorId: string
  surveyorName: string
  iskNumber: string
  coverLetter: string
  proposedAmount: number
  proposedCurrency: string
  proposedTimeline: number
  portfolioLinks?: string[]
  appliedAt: string
  status: ApplicationStatus
}

export interface JobReview {
  id: string
  jobId: string
  reviewerId: string
  surveyorId: string
  rating: 1 | 2 | 3 | 4 | 5
  comment: string
  qualityRating: number
  timelinessRating: number
  communicationRating: number
  createdAt: string
}

export interface SurveyorProfile {
  userId: string
  displayName: string
  iskNumber?: string
  firmName?: string
  county?: string
  specializations: string[]
  yearsExperience?: number
  bio?: string
  averageRating: number
  totalReviews: number
  jobsCompleted: number
  verifiedIsk: boolean
  profilePublic: boolean
  createdAt: string
}
