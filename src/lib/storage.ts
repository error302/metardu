import { Storage } from '@google-cloud/storage'

const gcs = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: process.env.GCS_KEY_FILE 
    ? JSON.parse(process.env.GCS_KEY_FILE)
    : undefined,
})

const bucket = gcs.bucket(process.env.GCS_BUCKET_NAME || 'metardu-storage')

export async function uploadFile(
  file: Buffer,
  filename: string,
  contentType: string,
  folder: string = 'uploads'
): Promise<string> {
  const path = `${folder}/${Date.now()}-${filename}`
  const fileRef = bucket.file(path)
  
  await fileRef.save(file, {
    contentType,
    metadata: {
      CacheControl: 'public, max-age=31536000',
    },
  })
  
  return `https://storage.googleapis.com/${bucket.name}/${path}`
}

export async function downloadFile(path: string): Promise<Buffer> {
  const fileRef = bucket.file(path)
  const [contents] = await fileRef.download()
  return contents
}

export async function deleteFile(path: string): Promise<void> {
  const fileRef = bucket.file(path)
  await fileRef.delete()
}

export async function getSignedUrl(path: string, expiresIn: number = 3600): Promise<string> {
  const fileRef = bucket.file(path)
  const [url] = await fileRef.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresIn * 1000,
  })
  return url
}

export function getPublicUrl(path: string): string {
  return `https://storage.googleapis.com/${bucket.name}/${path}`
}