import { getDB } from './database';
import { Word } from '../store/useAppStore';

// --- Words Table Queries ---

export const getWords = async (): Promise<Word[]> => {
  const db = await getDB();
  const allRows = await db.getAllAsync('SELECT * FROM words;');
  return allRows as Word[];
};

export const saveWord = async (word: Word) => {
  const db = await getDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO words 
      (id, word, meaning, dateAdded, fsrsStability, fsrsDifficulty, fsrsLapses, fsrsReps, fsrsState, lastReview, nextReview, reviewCount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      word.id, word.word, word.meaning, word.dateAdded, word.fsrsStability, 
      word.fsrsDifficulty, word.fsrsLapses, word.fsrsReps, word.fsrsState, 
      word.lastReview, word.nextReview, word.reviewCount
    ]
  );
};

export const saveWordsBulk = async (words: Word[]) => {
  const db = await getDB();
  
  // Use a transaction for bulk inserts to greatly improve speed
  await db.withTransactionAsync(async () => {
    for (const word of words) {
      await db.runAsync(
        `INSERT OR REPLACE INTO words 
          (id, word, meaning, dateAdded, fsrsStability, fsrsDifficulty, fsrsLapses, fsrsReps, fsrsState, lastReview, nextReview, reviewCount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          word.id, word.word, word.meaning, word.dateAdded, word.fsrsStability, 
          word.fsrsDifficulty, word.fsrsLapses, word.fsrsReps, word.fsrsState, 
          word.lastReview, word.nextReview, word.reviewCount
        ]
      );
    }
  });
};

export const deleteWord = async (id: string) => {
  const db = await getDB();
  await db.runAsync('DELETE FROM words WHERE id = ?;', [id]);
};

export const replaceAllWords = async (words: Word[]) => {
  const db = await getDB();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM words');
    for (const word of words) {
      await db.runAsync(
        `INSERT INTO words 
          (id, word, meaning, dateAdded, fsrsStability, fsrsDifficulty, fsrsLapses, fsrsReps, fsrsState, lastReview, nextReview, reviewCount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          word.id, word.word, word.meaning, word.dateAdded, word.fsrsStability,
          word.fsrsDifficulty, word.fsrsLapses, word.fsrsReps, word.fsrsState,
          word.lastReview, word.nextReview, word.reviewCount,
        ]
      );
    }
  });
};

// --- Sync Metadata Queries ---

export const getSyncMetadata = async (key: string): Promise<string | null> => {
  const db = await getDB();
  const rows = await db.getAllAsync('SELECT value FROM sync_metadata WHERE key = ?;', [key]);
  const row = rows[0] as { value?: string } | undefined;
  return row?.value ?? null;
};

export const setSyncMetadata = async (key: string, value: string) => {
  const db = await getDB();
  await db.runAsync('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?);', [key, value]);
};

// --- Sync Queue Queries ---

export const getSyncQueue = async () => {
  const db = await getDB();
  return await db.getAllAsync('SELECT * FROM sync_queue ORDER BY timestamp ASC;');
};

export const addSyncQueueItem = async (wordId: string, action: string, data: any) => {
  const db = await getDB();
  await db.runAsync(
    'INSERT INTO sync_queue (wordId, action, data, timestamp) VALUES (?, ?, ?, ?)',
    [wordId, action, JSON.stringify(data), new Date().toISOString()]
  );
};

export const clearSyncQueue = async () => {
  const db = await getDB();
  await db.runAsync('DELETE FROM sync_queue');
};

// Remove only specific successfully-processed items by their row IDs
export const removeSyncQueueItems = async (ids: number[]) => {
  if (ids.length === 0) return;
  const db = await getDB();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM sync_queue WHERE id IN (${placeholders})`, ids);
};

// Clear all local SQLite data on account logout to prevent data leaking
export const clearAllLocalData = async () => {
  const db = await getDB();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM words;');
    await db.runAsync('DELETE FROM sync_queue;');
    await db.runAsync('DELETE FROM sync_metadata;');
  });
};

