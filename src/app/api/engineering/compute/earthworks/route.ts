import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/api-client/server'
import { crossSectionCutFill, prismoidalVolume } from '@/lib/engine/engineering'

export async function POST(request: NextRequest) {
  try {
    const dbClient = await createClient()
    const { data: { session } } = await dbClient.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { crossSections, designElevations } = body

    if (!crossSections || !designElevations) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const sections = crossSections.map((cs: { chainage: number; levels: Array<{ offset: number; elevation: number }> }, i: number) => {
      const { cutArea, fillArea } = crossSectionCutFill(designElevations[i], cs.levels)
      return { ...cs, cutArea, fillArea }
    })

    let totalCut = 0
    let totalFill = 0

    for (let i = 1; i < sections.length; i++) {
      const dist = sections[i].chainage - sections[i - 1].chainage
      totalCut += prismoidalVolume(sections[i - 1].cutArea, sections[i].cutArea, dist)
      totalFill += prismoidalVolume(sections[i - 1].fillArea, sections[i].fillArea, dist)
    }

    return NextResponse.json({
      sections,
      totalCutM3: totalCut,
      totalFillM3: totalFill,
      netM3: totalCut - totalFill
    })
  } catch (error) {
    console.error('Earthworks compute error:', error)
    return NextResponse.json({ error: 'Failed to compute earthworks' }, { status: 500 })
  }
}