import { getDB } from './database';
import { Word } from '../store/useAppStore';
import { generateDeterministicWordId } from '../utils/idUtils';

// --- Words Table Queries ---

export const getWords = async (): Promise<Word[]> => {
  const db = await getDB();
  const allRows = await db.getAllAsync('SELECT * FROM words ORDER BY dateAdded ASC, rowid ASC;');
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

export const incrementSyncQueueRetryCount = async (ids: number[]) => {
  if (ids.length === 0) return;
  const db = await getDB();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE sync_queue SET retryCount = COALESCE(retryCount, 0) + 1 WHERE id IN (${placeholders})`,
    ids
  );
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

// Helper to merge an existing user word and an incoming guest word for the same word key
const mergeWordRecords = (existing: Word, incoming: Word, newId: string): Word => {
  let reviewWinner = existing;
  if (existing.lastReview && incoming.lastReview) {
    if (new Date(existing.lastReview).getTime() !== new Date(incoming.lastReview).getTime()) {
      reviewWinner = new Date(existing.lastReview) > new Date(incoming.lastReview) ? existing : incoming;
    } else if (existing.reviewCount !== incoming.reviewCount) {
      reviewWinner = existing.reviewCount > incoming.reviewCount ? existing : incoming;
    }
  } else if (existing.lastReview && !incoming.lastReview) {
    reviewWinner = existing;
  } else if (!existing.lastReview && incoming.lastReview) {
    reviewWinner = incoming;
  } else if (existing.reviewCount !== incoming.reviewCount) {
    reviewWinner = existing.reviewCount > incoming.reviewCount ? existing : incoming;
  }

  let contentWinner = existing;
  if (existing.meaning && !incoming.meaning) {
    contentWinner = existing;
  } else if (!existing.meaning && incoming.meaning) {
    contentWinner = incoming;
  } else if (existing.meaning !== incoming.meaning) {
    contentWinner = incoming.meaning.length >= existing.meaning.length ? incoming : existing;
  }

  const earliestDateAdded =
    existing.dateAdded && incoming.dateAdded
      ? (new Date(existing.dateAdded) <= new Date(incoming.dateAdded) ? existing.dateAdded : incoming.dateAdded)
      : existing.dateAdded || incoming.dateAdded;

  return {
    id: newId,
    word: incoming.word || existing.word,
    meaning: contentWinner.meaning,
    dateAdded: earliestDateAdded,
    fsrsStability: reviewWinner.fsrsStability,
    fsrsDifficulty: reviewWinner.fsrsDifficulty,
    fsrsLapses: reviewWinner.fsrsLapses,
    fsrsReps: reviewWinner.fsrsReps,
    fsrsState: reviewWinner.fsrsState,
    lastReview: reviewWinner.lastReview,
    nextReview: reviewWinner.nextReview,
    reviewCount: reviewWinner.reviewCount,
  };
};

// Migrate words created in guest mode to user-prefixed IDs upon authentication
export const migrateGuestWordsToUser = async (userId: string): Promise<void> => {
  if (!userId) return;
  const db = await getDB();
  const words = await getWords();

  await db.withTransactionAsync(async () => {
    for (const word of words) {
      const oldId = word.id;
      const newId = await generateDeterministicWordId(userId, word.word);

      if (oldId !== newId) {
        // Check if a row with newId already exists in local SQLite database
        const existingRows = await db.getAllAsync('SELECT * FROM words WHERE id = ?;', [newId]);

        if (existingRows.length > 0) {
          const existingWord = existingRows[0] as Word;
          const merged = mergeWordRecords(existingWord, word, newId);

          // Update the existing record with merged values
          await db.runAsync(
            `INSERT OR REPLACE INTO words 
              (id, word, meaning, dateAdded, fsrsStability, fsrsDifficulty, fsrsLapses, fsrsReps, fsrsState, lastReview, nextReview, reviewCount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              merged.id, merged.word, merged.meaning, merged.dateAdded, merged.fsrsStability,
              merged.fsrsDifficulty, merged.fsrsLapses, merged.fsrsReps, merged.fsrsState,
              merged.lastReview, merged.nextReview, merged.reviewCount
            ]
          );

          // Remove the obsolete guest row
          await db.runAsync('DELETE FROM words WHERE id = ?;', [oldId]);
        } else {
          // No collision with existing record, direct ID update is safe
          await db.runAsync('UPDATE words SET id = ? WHERE id = ?;', [newId, oldId]);
        }

        // Redirect any pending sync queue entries pointing to oldId
        await db.runAsync('UPDATE sync_queue SET wordId = ? WHERE wordId = ?;', [newId, oldId]);
      }
    }
  });
};



