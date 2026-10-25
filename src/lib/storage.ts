/**
 * File storage — local filesystem with GCS fallback
 * 
 * When GCS_PROJECT_ID and GCS_BUCKET_NAME are set, uses Google Cloud Storage.
 * Otherwise, saves to local filesystem under STORAGE_ROOT (default: ./uploads).
 */

import { promises as fs, createReadStream } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { logger } from '@/lib/logger'

const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(process.cwd(), 'upload')
const USE_GCS = !!(process.env.GCS_PROJECT_ID && process.env.GCS_BUCKET_NAME)

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true }).catch(() => {})
}

function localPublicUrl(filePath: string): string {
  // Return a path relative to STORAGE_ROOT that can be served via /api/storage
  return `/api/storage?path=${encodeURIComponent(filePath)}`
}

export async function uploadFile(
  file: Buffer,
  filename: string,
  contentType: string,
  folder: string = 'uploads'
): Promise<string> {
  const hash = crypto.randomBytes(8).toString('hex')
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/[. ]+$/g, '') || 'upload'
  const storagePath = `${folder}/${hash}-${safeName}`

  if (USE_GCS) {
    const { Storage } = await import('@google-cloud/storage')
    const gcs = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: process.env.GCS_KEY_FILE
        ? ((JSON.parse(process.env.GCS_KEY_FILE) as unknown) as Record<string, string>)
        : undefined,
    })
    const bucket = gcs.bucket(process.env.GCS_BUCKET_NAME || 'metardu-storage')
    const fileRef = bucket.file(storagePath)
    await fileRef.save(file, {
      contentType,
      // Uploaded survey files, reports, and project evidence are private data.
      metadata: { cacheControl: 'private, no-store' },
    })
    return storagePath
  }

  // Local filesystem fallback
  const fullPath = path.join(STORAGE_ROOT, storagePath)
  await ensureDir(path.dirname(fullPath))
  await fs.writeFile(fullPath, file)
  return storagePath
}

export async function downloadFile(filePath: string): Promise<Buffer> {
  if (USE_GCS) {
    const { Storage } = await import('@google-cloud/storage')
    const gcs = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: process.env.GCS_KEY_FILE
        ? ((JSON.parse(process.env.GCS_KEY_FILE) as unknown) as Record<string, string>)
        : undefined,
    })
    const bucket = gcs.bucket(process.env.GCS_BUCKET_NAME || 'metardu-storage')
    const [contents] = await bucket.file(filePath).download()
    return contents
  }

  const fullPath = path.join(STORAGE_ROOT, filePath)
  return fs.readFile(fullPath)
}

/** Stop a retained-artifact read at its declared window, including provider streams. */
export async function downloadFileBounded(filePath:string,maxBytes:number):Promise<Buffer>{
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('A positive artifact read limit is required.')
  let stream:import('node:stream').Readable
  if(USE_GCS){
    const {Storage}=await import('@google-cloud/storage')
    const gcs=new Storage({projectId:process.env.GCS_PROJECT_ID,credentials:process.env.GCS_KEY_FILE?JSON.parse(process.env.GCS_KEY_FILE) as Record<string,string>:undefined})
    stream=gcs.bucket(process.env.GCS_BUCKET_NAME||'metardu-storage').file(filePath).createReadStream()
  }else stream=createReadStream(path.join(STORAGE_ROOT,filePath))
  const parts:Buffer[]=[];let size=0
  for await(const part of stream){
    if(!Buffer.isBuffer(part))throw new Error('Unexpected artifact stream encoding.')
    size+=part.length
    if(size>maxBytes)throw new Error('The retained artifact exceeds its read limit.')
    parts.push(part)
  }
  return Buffer.concat(parts,size)
}

export async function deleteFile(filePath: string): Promise<void> {
  if (USE_GCS) {
    const { Storage } = await import('@google-cloud/storage')
    const gcs = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: process.env.GCS_KEY_FILE
        ? ((JSON.parse(process.env.GCS_KEY_FILE) as unknown) as Record<string, string>)
        : undefined,
    })
    const bucket = gcs.bucket(process.env.GCS_BUCKET_NAME || 'metardu-storage')
    await bucket.file(filePath).delete()
    return
  }

  const fullPath = path.join(STORAGE_ROOT, filePath)
  await fs.unlink(fullPath).catch(() => {})
}

export async function getSignedUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
  if (USE_GCS) {
    const { Storage } = await import('@google-cloud/storage')
    const gcs = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: process.env.GCS_KEY_FILE
        ? ((JSON.parse(process.env.GCS_KEY_FILE) as unknown) as Record<string, string>)
        : undefined,
    })
    const bucket = gcs.bucket(process.env.GCS_BUCKET_NAME || 'metardu-storage')
    const [url] = await bucket.file(filePath).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresIn * 1000,
    })
    return url
  }

  // Local: return a downloadable path via the storage API
  const fullPath = path.join(STORAGE_ROOT, filePath)
  const exists = await fs.access(fullPath).then(() => true).catch(() => false)
  if (!exists) {
    logger.warn(`[storage] File not found: ${fullPath}`)
  }
  return `/api/storage?path=${encodeURIComponent(filePath)}`
}

export function getPublicUrl(filePath: string): string {
  if (USE_GCS) {
    return `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME || 'metardu-storage'}/${filePath}`
  }
  return localPublicUrl(filePath)
}
