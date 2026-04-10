import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'metardu_voicenotes';
const DB_VERSION = 1;

export interface VoiceNoteRecord {
  id: string;
  projectId?: string;
  stationId?: string;
  stationName?: string;
  easting?: number;
  northing?: number;
  audioBlob: Blob;
  transcript: string;
  duration: number; // seconds
  timestamp: number; // Date.now()
}

let dbInstance: IDBPDatabase | null = null;

async function getVoiceDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('notes')) {
        const store = db.createObjectStore('notes', { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('stationId', 'stationId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    },
  });

  return dbInstance;
}

export async function saveVoiceNote(note: VoiceNoteRecord): Promise<void> {
  const db = await getVoiceDB();
  await db.put('notes', note);
}

export async function getVoiceNote(id: string): Promise<VoiceNoteRecord | undefined> {
  const db = await getVoiceDB();
  return db.get('notes', id);
}

export async function getVoiceNotesByStation(stationId: string): Promise<VoiceNoteRecord[]> {
  const db = await getVoiceDB();
  const all = await db.getAllFromIndex('notes', 'stationId', stationId);
  return all.sort((a, b) => b.timestamp - a.timestamp);
}

export async function getVoiceNotesByProject(projectId: string): Promise<VoiceNoteRecord[]> {
  const db = await getVoiceDB();
  const all = await db.getAllFromIndex('notes', 'projectId', projectId);
  return all.sort((a, b) => b.timestamp - a.timestamp);
}

export async function getAllVoiceNotes(): Promise<VoiceNoteRecord[]> {
  const db = await getVoiceDB();
  const all = await db.getAll('notes');
  return all.sort((a, b) => b.timestamp - a.timestamp);
}

export async function deleteVoiceNote(id: string): Promise<void> {
  const db = await getVoiceDB();
  await db.delete('notes', id);
}

export async function updateVoiceNoteTranscript(id: string, transcript: string): Promise<void> {
  const db = await getVoiceDB();
  const note = await db.get('notes', id);
  if (note) {
    note.transcript = transcript;
    await db.put('notes', note);
  }
}
