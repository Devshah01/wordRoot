import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import {
  getSyncQueue,
  clearSyncQueue,
  removeSyncQueueItems,
  incrementSyncQueueRetryCount,
  getWords,
  saveWordsBulk,
  addSyncQueueItem,
  getSyncMetadata,
  setSyncMetadata,
} from '../db/queries';
import { api } from './api';
import { Word, LocalWord, useAppStore } from '../store/useAppStore';
import { generateDeterministicWordId } from '../utils/idUtils';

let isSyncing = false;

/** Queue a change for cloud sync when the user has an account linked. */
export async function queueCloudChange(wordId: string, action: string, data: Record<string, unknown>) {
  if (!useAppStore.getState().isAuthenticated) return;
  await addSyncQueueItem(wordId, action, data);
  // Automatically push the change to the cloud in the background
  triggerSync(true).catch(console.error);
}

export function wordKey(w: Word): string {
  return w.word.trim().toLowerCase();
}

export function mergeTwoWords(a: Word, b: Word): Word {
  // 1. Determine Study / FSRS statistics winner
  let reviewWinner = a;
  if (a.lastReview && b.lastReview) {
    if (new Date(a.lastReview).getTime() !== new Date(b.lastReview).getTime()) {
      reviewWinner = new Date(a.lastReview) > new Date(b.lastReview) ? a : b;
    } else if (a.reviewCount !== b.reviewCount) {
      reviewWinner = a.reviewCount > b.reviewCount ? a : b;
    }
  } else if (a.lastReview && !b.lastReview) {
    reviewWinner = a;
  } else if (!a.lastReview && b.lastReview) {
    reviewWinner = b;
  } else if (a.reviewCount !== b.reviewCount) {
    reviewWinner = a.reviewCount > b.reviewCount ? a : b;
  }

  // 2. Determine Text Content (meaning/word) winner
  let contentWinner = a;
  if (a.updatedAt && b.updatedAt) {
    if (new Date(a.updatedAt).getTime() !== new Date(b.updatedAt).getTime()) {
      contentWinner = new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b;
    }
  } else if (a.updatedAt && !b.updatedAt) {
    contentWinner = a;
  } else if (!a.updatedAt && b.updatedAt) {
    contentWinner = b;
  } else if (a.meaning !== b.meaning) {
    // If no explicit updatedAt, but meanings differ:
    // Retain whichever definition was customized/edited (prefer non-empty/longer definition or lower review count edit)
    if (a.reviewCount < b.reviewCount) {
      contentWinner = a;
    } else if (b.reviewCount < a.reviewCount) {
      contentWinner = b;
    } else {
      contentWinner = a.meaning.length >= b.meaning.length ? a : b;
    }
  }

  const earliestDateAdded =
    new Date(a.dateAdded) <= new Date(b.dateAdded) ? a.dateAdded : b.dateAdded;

  return {
    id: a.id || b.id,
    word: contentWinner.word,
    meaning: contentWinner.meaning,
    dateAdded: earliestDateAdded,
    updatedAt: contentWinner.updatedAt || reviewWinner.updatedAt,

    // Study & FSRS statistics from reviewWinner
    fsrsStability: reviewWinner.fsrsStability,
    fsrsDifficulty: reviewWinner.fsrsDifficulty,
    fsrsLapses: reviewWinner.fsrsLapses,
    fsrsReps: reviewWinner.fsrsReps,
    fsrsState: reviewWinner.fsrsState,
    lastReview: reviewWinner.lastReview,
    nextReview: reviewWinner.nextReview,
    reviewCount: reviewWinner.reviewCount,
  };
}

export function pickWinner(a: Word, b: Word): Word {
  return mergeTwoWords(a, b);
}

export function mergeWords(local: Word[], server: Word[]): Word[] {
  const result = new Map<string, Word>();

  for (const s of server) {
    result.set(wordKey(s), s);
  }

  for (const l of local) {
    const key = wordKey(l);
    const existing = result.get(key);
    if (!existing) {
      result.set(key, l);
    } else {
      const merged = mergeTwoWords(existing, l);
      result.set(key, { ...merged, id: existing.id || l.id });
    }
  }

  return Array.from(result.values());
}

function wordsDiffer(a: Word, b: Word): boolean {
  return (
    a.meaning !== b.meaning ||
    a.fsrsStability !== b.fsrsStability ||
    a.fsrsDifficulty !== b.fsrsDifficulty ||
    a.fsrsLapses !== b.fsrsLapses ||
    a.fsrsReps !== b.fsrsReps ||
    a.fsrsState !== b.fsrsState ||
    a.lastReview !== b.lastReview ||
    a.nextReview !== b.nextReview ||
    a.reviewCount !== b.reviewCount
  );
}

async function persistDraftVocabLines(draftVocabLines: LocalWord[]): Promise<Word[]> {
  const validDrafts = draftVocabLines.filter((l) => l.word.trim() && l.meaning.trim());
  if (validDrafts.length === 0) return [];

  const userId = useAppStore.getState().user?.id;
  const now = new Date().toISOString();
  const draftWords: Word[] = await Promise.all(
    validDrafts.map(async (entry) => ({
      id: await generateDeterministicWordId(userId, entry.word),
      word: entry.word.trim().toLowerCase(),
      meaning: entry.meaning.trim(),
      dateAdded: now,
      fsrsStability: 1.0,
      fsrsDifficulty: 5.0,
      fsrsLapses: 0,
      fsrsReps: 0,
      fsrsState: 'New',
      lastReview: null,
      nextReview: now,
      reviewCount: 0,
    }))
  );

  await saveWordsBulk(draftWords);
  return draftWords;
}

async function queueMergedChanges(merged: Word[], serverWords: Word[]): Promise<void> {
  const serverByKey = new Map(serverWords.map((w) => [wordKey(w), w]));

  for (const word of merged) {
    const key = wordKey(word);
    const serverWord = serverByKey.get(key);

    if (!serverWord) {
      await addSyncQueueItem(word.id, 'add', {
        word: word.word,
        meaning: word.meaning,
        dateAdded: word.dateAdded,
        fsrsStability: word.fsrsStability,
        fsrsDifficulty: word.fsrsDifficulty,
        fsrsLapses: word.fsrsLapses,
        fsrsReps: word.fsrsReps,
        fsrsState: word.fsrsState,
        lastReview: word.lastReview,
        nextReview: word.nextReview,
        reviewCount: word.reviewCount,
      });
    } else if (wordsDiffer(word, serverWord)) {
      await addSyncQueueItem(word.id, 'update', {
        word: word.word,
        meaning: word.meaning,
        updatedWord: word,
      });
    }
  }
}

export async function performCloudSync(options?: {
  draftVocabLines?: LocalWord[];
  clearDrafts?: () => void;
}): Promise<{ success: boolean; message: string }> {
  try {
    if (options?.draftVocabLines?.length) {
      await persistDraftVocabLines(options.draftVocabLines);
      options.clearDrafts?.();
    }

    const net = await NetInfo.fetch();
    const isOnline = net.isConnected && net.isInternetReachable !== false;

    if (!isOnline) {
      const localWords = await getWords();
      if (localWords.length === 0) {
        return { success: false, message: 'No internet connection.' };
      }
      return { success: false, message: 'Offline — your data is saved on this device.' };
    }

    // 1. Flush offline queue changes first (deletes, edits, reviews, adds) so server state is updated
    const pushResult = await triggerSync(useAppStore.getState().isAuthenticated);
    if (!pushResult.success || !pushResult.queueEmpty) {
      return {
        success: false,
        message: 'Could not push all offline changes to server. Local changes will retry when online.',
      };
    }

    // 2. Fetch server words now that all pending local changes have been applied
    let serverWords: Word[] = [];
    try {
      serverWords = await api.words.getAll();
    } catch (e) {
      console.warn('Could not reach server during cloud sync', e);
      return { success: false, message: 'Could not reach server. Local changes will sync when online.' };
    }

    // 3. Merge local words with server words
    const localWords = await getWords();
    const merged = mergeWords(localWords, serverWords);
    await saveWordsBulk(merged);

    // 4. Queue and push any residual differences
    await queueMergedChanges(merged, serverWords);
    await setSyncMetadata('last_sync_at', new Date().toISOString());
    await triggerSync(useAppStore.getState().isAuthenticated);

    return { success: true, message: 'Synced successfully.' };
  } catch (e) {
    console.error('Cloud sync failed', e);
    return { success: false, message: 'Sync failed. Your local data is safe.' };
  }
}

export async function getLastSyncLabel(): Promise<string | null> {
  const lastSync = await getSyncMetadata('last_sync_at');
  if (!lastSync) return null;
  const date = new Date(lastSync);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

const MAX_RETRIES = 5;

export const triggerSync = async (
  isAuthenticated: boolean
): Promise<{ success: boolean; queueEmpty: boolean }> => {
  if (!isAuthenticated) return { success: true, queueEmpty: true };
  if (isSyncing) return { success: false, queueEmpty: false };

  const state = await NetInfo.fetch();
  if (!state.isConnected || state.isInternetReachable === false) {
    return { success: false, queueEmpty: false };
  }

  isSyncing = true;
  try {
    let rawQueue = await getSyncQueue();
    if (rawQueue.length === 0) {
      isSyncing = false;
      return { success: true, queueEmpty: true };
    }

    // Dead-Letter Eviction: Purge items exceeding MAX_RETRIES
    const expiredItems = rawQueue.filter((item: any) => (item.retryCount ?? 0) >= MAX_RETRIES);
    if (expiredItems.length > 0) {
      const expiredIds = expiredItems.map((item: any) => item.id);
      console.warn(`Evicting ${expiredIds.length} sync queue items that exceeded max retries (${MAX_RETRIES}):`, expiredIds);
      await removeSyncQueueItems(expiredIds);
      rawQueue = rawQueue.filter((item: any) => (item.retryCount ?? 0) < MAX_RETRIES);
    }

    if (rawQueue.length === 0) {
      isSyncing = false;
      return { success: true, queueEmpty: true };
    }

    const BATCH_SIZE = 50;
    let totalSynced = 0;
    let anyBatchFailed = false;

    for (let i = 0; i < rawQueue.length; i += BATCH_SIZE) {
      const chunk = rawQueue.slice(i, i + BATCH_SIZE);
      const validChunk: any[] = [];
      const corruptItemIds: number[] = [];

      for (const item of chunk) {
        try {
          const parsedData = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
          validChunk.push({
            ...item,
            data: parsedData,
          });
        } catch (jsonErr) {
          console.error(`Removing corrupt sync queue item ${item.id} due to JSON parse error:`, jsonErr);
          corruptItemIds.push(item.id);
        }
      }

      if (corruptItemIds.length > 0) {
        await removeSyncQueueItems(corruptItemIds);
      }

      if (validChunk.length === 0) {
        continue;
      }

      const payload = validChunk.map((item: any) => ({
        id: item.id,
        wordId: item.wordId,
        action: item.action,
        data: item.data,
        timestamp: item.timestamp,
      }));

      const chunkItemIds = validChunk.map((c: any) => c.id);

      try {
        const response = await api.sync.push(payload);
        if (response && response.success) {
          if (response.successIds && response.successIds.length > 0) {
            await removeSyncQueueItems(response.successIds);
            totalSynced += response.successIds.length;
          } else {
            await removeSyncQueueItems(chunkItemIds);
            totalSynced += validChunk.length;
          }

          if (response.failedIds && response.failedIds.length > 0) {
            await incrementSyncQueueRetryCount(response.failedIds);
          }

          await setSyncMetadata('last_push_at', new Date().toISOString());
        } else {
          console.warn(`Sync chunk rejected by server: ${response?.error || 'Unknown error'}`);
          await incrementSyncQueueRetryCount(chunkItemIds);
          anyBatchFailed = true;
          break;
        }
      } catch (chunkErr: any) {
        console.error(`Sync chunk failed (${i} to ${i + validChunk.length}):`, chunkErr);
        const errorMsg = chunkErr?.message || '';
        const isNetworkError = errorMsg.includes('Cannot reach server') || errorMsg.includes('Network request failed');

        if (!isNetworkError) {
          await incrementSyncQueueRetryCount(chunkItemIds);
        }
        anyBatchFailed = true;
        break;
      }
    }

    const remainingQueue = await getSyncQueue();
    console.log(`Synced ${totalSynced}/${rawQueue.length} items. Remaining in queue: ${remainingQueue.length}`);

    return {
      success: !anyBatchFailed || totalSynced > 0,
      queueEmpty: remainingQueue.length === 0,
    };
  } catch (error) {
    console.error('Failed to sync offline queue', error);
    return { success: false, queueEmpty: false };
  } finally {
    isSyncing = false;
  }
};

export const initSyncListener = () => {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      triggerSync(useAppStore.getState().isAuthenticated);
    }
  });
};
