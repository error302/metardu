import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'

export const dynamic = 'force-dynamic'

export interface DiscussionThread {
  id: string
  title: string
  content: string
  authorName: string
  authorRole: 'LICENSED_SURVEYOR' | 'MISK_MEMBER' | 'GRADUATE_SURVEYOR' | 'STUDENT'
  authorCounty: string
  category: 'ARDHISASA' | 'BOUNDARY_DISPUTE' | 'GNSS_HARDWARE' | 'STATUTORY_FEES' | 'FIELD_TECHNIQUES'
  tags: string[]
  upvotes: number
  repliesCount: number
  hasAcceptedAnswer: boolean
  createdAt: string
  updatedAt: string
}

let MEMORY_THREADS: DiscussionThread[] = [
  {
    id: 'disc-101',
    title: 'ArdhiSasa Mutation Form Rejection: "Boundary Traverse Misclosure Exceeds 1:5,000"',
    content: 'Has anyone encountered rejection code AS-MUT-04 when uploading Form C22 and mutation plans for Kajiado/Kaputiei parcels? My linear misclosure on site was 1:5,800 using Bowditch, but ArdhiSasa automated validator reported 1:4,920. Is ArdhiSasa re-running raw Cassini coordinates against Arc 1960 UTM without local scale factor correction?',
    authorName: 'Eng. Francis Mwangi, MISK',
    authorRole: 'LICENSED_SURVEYOR',
    authorCounty: 'Kajiado',
    category: 'ARDHISASA',
    tags: ['ArdhiSasa', 'Form C22', 'Scale Factor', 'Bowditch'],
    upvotes: 24,
    repliesCount: 7,
    hasAcceptedAnswer: true,
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
  },
  {
    id: 'disc-102',
    title: 'Trimble R12i & Leica GS18 RTK fix issues when connecting to KENCORS Mountpoint 37S',
    content: 'Over the past 48 hours, rovers across Nairobi and Machakos have been dropping from RTK Fixed to Float after 2-3 minutes on KENCORS port 2101 (Mountpoint RTCM32_37S). Has anyone switched to the new MSM7 multi-constellation stream or using Leica SmartNet as secondary fallback?',
    authorName: 'Geoffrey Omondi',
    authorRole: 'GRADUATE_SURVEYOR',
    authorCounty: 'Nairobi',
    category: 'GNSS_HARDWARE',
    tags: ['KENCORS', 'RTK', 'NTRIP', 'Trimble', 'Leica'],
    upvotes: 31,
    repliesCount: 12,
    hasAcceptedAnswer: true,
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString()
  },
  {
    id: 'disc-103',
    title: 'Handling conflicting Registry Index Maps (RIM Sheet 4 vs FR 198/23) in Kiambu Subdivisions',
    content: 'During a boundary retracement in Ruiru, the physical beacons on the ground agree perfectly with the original 1974 Field Record (FR 198/23), but the current digital RIM vector shows a 3.4 metre shift across the northern boundary road reserve. What is the standard SoK procedure for filing a RIM amendment notice without holding up client conveyancing?',
    authorName: 'David Kariuki, LSB',
    authorRole: 'LICENSED_SURVEYOR',
    authorCounty: 'Kiambu',
    category: 'BOUNDARY_DISPUTE',
    tags: ['RIM Amendment', 'Survey Act Cap 299', 'Road Reserve', 'Beacons'],
    upvotes: 45,
    repliesCount: 16,
    hasAcceptedAnswer: false,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 86400000).toISOString()
  },
  {
    id: 'disc-104',
    title: 'Applying Survey Act Cap 299 Statutory Scale of Fees on Sectional Property Units',
    content: 'With the enactment of the Sectional Properties Act 2020, how are firms billing for 50+ unit high-rise residential surveys in Kilimani/Westlands? Are you charging the standard per-unit rate from Part IX or applying composite topographic + architectural tie-in day rates?',
    authorName: 'Alice Wambui',
    authorRole: 'MISK_MEMBER',
    authorCounty: 'Nairobi',
    category: 'STATUTORY_FEES',
    tags: ['Scale of Fees', 'Sectional Properties', 'Client Billing'],
    upvotes: 19,
    repliesCount: 8,
    hasAcceptedAnswer: true,
    createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 86400000).toISOString()
  },
  {
    id: 'disc-105',
    title: 'Best practice for Crandall Adjustment vs Bowditch on long cadastral traverses',
    content: 'When traversing along heavy terrain with long lines where angles are measured with a 1-second total station (TS16) but distances are subject to steep slope refraction, Crandall method yields much cleaner boundary geometry than Bowditch. Anyone submitting Crandall sheets to Survey of Kenya?',
    authorName: 'Hassan Noor',
    authorRole: 'LICENSED_SURVEYOR',
    authorCounty: 'Mombasa',
    category: 'FIELD_TECHNIQUES',
    tags: ['Crandall', 'Traverse Adjustment', 'SoK Compliance'],
    upvotes: 28,
    repliesCount: 9,
    hasAcceptedAnswer: true,
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 6 * 86400000).toISOString()
  }
]

export const GET = apiHandler({ auth: false }, async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const query = searchParams.get('q')?.toLowerCase()

  let list = [...MEMORY_THREADS]
  if (category && category !== 'ALL') {
    list = list.filter(t => t.category === category)
  }
  if (query) {
    list = list.filter(t => 
      t.title.toLowerCase().includes(query) ||
      t.content.toLowerCase().includes(query) ||
      t.tags.some(tag => tag.toLowerCase().includes(query)) ||
      t.authorCounty.toLowerCase().includes(query)
    )
  }

  return NextResponse.json({ success: true, data: list })
})

export const POST = apiHandler({ auth: false }, async (req: NextRequest) => {
  try {
    const body = await req.json()
    const { title, content, category, authorName, authorRole, authorCounty, tags } = body

    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 })
    }

    const newThread: DiscussionThread = {
      id: `disc-${Date.now()}`,
      title,
      content,
      authorName: authorName || 'Licensed Surveyor',
      authorRole: authorRole || 'LICENSED_SURVEYOR',
      authorCounty: authorCounty || 'Nairobi',
      category: category || 'FIELD_TECHNIQUES',
      tags: Array.isArray(tags) ? tags : ['General Surveying'],
      upvotes: 1,
      repliesCount: 0,
      hasAcceptedAnswer: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    MEMORY_THREADS.unshift(newThread)

    return NextResponse.json({ success: true, data: newThread })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to post discussion'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
