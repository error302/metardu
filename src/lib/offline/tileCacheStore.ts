const DB_NAME = 'METARDUTileCache'
let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => {
      databasePromise = null
      reject(request.error)
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        databasePromise = null
      }
      resolve(db)
    }
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('tiles')) db.createObjectStore('tiles', { keyPath: 'url' })
      if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'key' })
    }
  })

  return databasePromise
}

/** Read a tile blob without importing React or the downloader UI code. */
export async function getCachedTileBlob(url: string): Promise<Blob | null> {
  try {
    const db = await openDatabase()
    return await new Promise<Blob | null>((resolve) => {
      const request = db.transaction('tiles', 'readonly').objectStore('tiles').get(url)
      request.onsuccess = () => resolve((request.result as { blob: Blob } | undefined)?.blob ?? null)
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}
