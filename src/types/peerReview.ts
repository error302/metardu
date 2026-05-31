export type PeerReviewStatus = 'OPEN' | 'IN_REVIEW' | 'COMPLETE' | 'DISPUTED'
export type ReviewVerdict = 'APPROVED' | 'APPROVED_WITH_COMMENTS' | 'REJECTED'
export type ReviewSeverity = 'INFO' | 'WARNING' | 'ERROR'
export type ReviewUrgency = 'STANDARD' | 'URGENT'

export interface PeerReviewRequest {
  id: string
  submittedBy: string
  documentType: 'DEED_PLAN' | 'SURVEY_REPORT' | 'TRAVERSE_COMPUTATION'
  documentId: string
  title: string
  description: string
  urgency: ReviewUrgency
  status: PeerReviewStatus
  createdAt: string
  dueBy?: string
}

export interface PeerReviewer {
  id: string
  requestId: string
  userId: string
  name: string
  iskNumber: string
  assignedAt: string
  completedAt?: string
  verdict?: ReviewVerdict
  comments: ReviewComment[]
  cpdPointsAwarded: number
}

export interface ReviewComment {
  id: string
  section: string
  severity: ReviewSeverity
  comment: string
  regulationCite?: string
  resolved: boolean
  createdAt: string
}
