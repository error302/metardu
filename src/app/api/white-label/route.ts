import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import db from '@/lib/db'
import { apiSuccess, apiError } from '@/lib/api/response'
import { join } from 'path'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** snake_case DB row → camelCase frontend object */
function rowToConfig(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    enabled: row.enabled ?? false,
    organizationName: row.organization_name ?? 'METARDU',
    logoUrl: row.logo_url ?? null,
    faviconUrl: row.favicon_url ?? null,
    primaryColor: row.primary_color ?? '#0EA5E9',
    customCss: row.custom_css ?? null,
    customDomain: row.custom_domain ?? null,
    emailFooter: row.email_footer ?? null,
    logoFileKey: row.logo_file_key ?? null,
    faviconFileKey: row.favicon_file_key ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const DEFAULT_CONFIG = {
  enabled: false,
  organizationName: 'METARDU',
  primaryColor: '#0EA5E9',
}

// ---------------------------------------------------------------------------
// GET – fetch current user's white-label config (or defaults)
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized'), { status: 401 })
    }

    const { rows } = await db.query(
      'SELECT * FROM white_label_configs WHERE user_id = $1',
      [session.user.id]
    )

    if (rows.length === 0) {
      return NextResponse.json(apiSuccess(DEFAULT_CONFIG))
    }

    return NextResponse.json(apiSuccess(rowToConfig(rows[0])))
  } catch (error) {
    console.error('[white-label] GET error:', error)
    return NextResponse.json(apiError('Failed to load white-label config'), { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PUT – upsert config fields (JSON body, no file upload)
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized'), { status: 401 })
    }

    const body = await request.json()

    const enabled = Boolean(body.enabled)
    const organizationName = String(body.organizationName ?? 'METARDU').slice(0, 120)
    const logoUrl = body.logoUrl ?? null
    const faviconUrl = body.faviconUrl ?? null
    const primaryColor = String(body.primaryColor ?? '#0EA5E9').slice(0, 7)
    const customCss = body.customCss ?? null
    const customDomain = body.customDomain ?? null
    const emailFooter = body.emailFooter ?? null

    const { rows } = await db.query(
      `INSERT INTO white_label_configs
         (user_id, enabled, organization_name, logo_url, favicon_url, primary_color, custom_css, custom_domain, email_footer)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id) DO UPDATE SET
         enabled        = EXCLUDED.enabled,
         organization_name = EXCLUDED.organization_name,
         logo_url       = EXCLUDED.logo_url,
         favicon_url    = EXCLUDED.favicon_url,
         primary_color  = EXCLUDED.primary_color,
         custom_css     = EXCLUDED.custom_css,
         custom_domain  = EXCLUDED.custom_domain,
         email_footer   = EXCLUDED.email_footer,
         updated_at     = NOW()
       RETURNING *`,
      [session.user.id, enabled, organizationName, logoUrl, faviconUrl, primaryColor, customCss, customDomain, emailFooter]
    )

    return NextResponse.json(apiSuccess(rowToConfig(rows[0])))
  } catch (error) {
    console.error('[white-label] PUT error:', error)
    return NextResponse.json(apiError('Failed to save white-label config'), { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST – file upload (logo or favicon via FormData)
// ---------------------------------------------------------------------------

const UPLOAD_BASE = join(process.cwd(), 'public', 'uploads', 'white-label')

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized'), { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const type = formData.get('type') as string | null // 'logo' | 'favicon'

    if (!file) {
      return NextResponse.json(apiError('No file provided'), { status: 400 })
    }

    if (!type || !['logo', 'favicon'].includes(type)) {
      return NextResponse.json(apiError('Missing or invalid type field (must be "logo" or "favicon")'), { status: 400 })
    }

    // Validate MIME type
    const allowedMimePrefixes = ['image/', 'image/svg+xml', 'image/x-icon']
    if (!allowedMimePrefixes.some((p) => file.type.startsWith(p))) {
      return NextResponse.json(apiError('Only image files are allowed'), { status: 400 })
    }

    // Derive file extension from original name
    const originalName = file.name || 'upload'
    const ext = originalName.includes('.') ? originalName.split('.').pop() : 'png'

    const timestamp = Date.now()
    const fileName = `${session.user.id}_${timestamp}.${ext}`
    const filePath = join(UPLOAD_BASE, fileName)

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_BASE)) {
      await mkdir(UPLOAD_BASE, { recursive: true })
    }

    const bytes = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(bytes))

    const publicUrl = `/uploads/white-label/${fileName}`
    const dbColumn = type === 'logo' ? 'logo_url' : 'favicon_url'
    const fileKeyColumn = type === 'logo' ? 'logo_file_key' : 'favicon_file_key'

    // Upsert the URL into the config row
    await db.query(
      `INSERT INTO white_label_configs (user_id, ${dbColumn}, ${fileKeyColumn})
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         ${dbColumn}    = EXCLUDED.${dbColumn},
         ${fileKeyColumn} = EXCLUDED.${fileKeyColumn},
         updated_at     = NOW()`,
      [session.user.id, publicUrl, fileName]
    )

    return NextResponse.json(
      apiSuccess({
        type,
        url: publicUrl,
        fileName,
      })
    )
  } catch (error) {
    console.error('[white-label] POST upload error:', error)
    return NextResponse.json(apiError('Failed to upload file'), { status: 500 })
  }
}
