import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { uploadFile, getSignedUrl, getPublicUrl, deleteFile } from '@/lib/storage'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const bucket = (formData.get('bucket') as string) || 'uploads'

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const contentType = file.type || 'application/octet-stream'

    const url = await uploadFile(buffer, file.name, contentType, bucket)
    return NextResponse.json({ url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path')
  const action = searchParams.get('action') // 'signed' | 'public' | 'delete'

  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  try {
    if (action === 'signed') {
      const expiresIn = parseInt(searchParams.get('expiresIn') || '3600', 10)
      const url = await getSignedUrl(path, expiresIn)
      return NextResponse.json({ url })
    } else if (action === 'delete') {
      await deleteFile(path)
      return NextResponse.json({ ok: true })
    } else {
      return NextResponse.json({ url: getPublicUrl(path) })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Storage operation failed' }, { status: 500 })
  }
}
