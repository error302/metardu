import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { RIM_TEMPLATES, getTemplatesByCategory, searchTemplates, getTemplateCategories, createSectionFromTemplate } from '@/lib/rim'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const search = searchParams.get('search')
    const categories = searchParams.get('categories') === 'true'

    if (categories) {
      return NextResponse.json({ success: true, data: getTemplateCategories() })
    }

    if (category) {
      return NextResponse.json({ success: true, data: getTemplatesByCategory(category) })
    }

    if (search) {
      return NextResponse.json({ success: true, data: searchTemplates(search) })
    }

    // Return all templates
    const templates = RIM_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      tags: t.tags,
      defaults: t.defaults,
      parcelCount: t.sampleParcels.length,
      beaconCount: t.sampleBeacons.length,
      regulationReference: t.regulationReference,
    }))

    return NextResponse.json({ success: true, data: templates })
  } catch (error) {
    console.error('[rim-templates] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch templates.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const { templateId, customizations } = await request.json()

    if (!templateId) {
      return NextResponse.json({ error: 'Missing templateId.' }, { status: 400 })
    }

    const result = createSectionFromTemplate(templateId, customizations || {})
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create section from template.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
