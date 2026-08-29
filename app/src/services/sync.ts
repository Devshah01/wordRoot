import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import {
  getSyncQueue,
  clearSyncQueue,
  removeSyncQueueItems,
  getWords,
  saveWordsBulk,
  replaceAllWords,
  addSyncQueueItem,
  getSyncMetadata,
  setSyncMetadata,
} from '../db/queries';
import { api } from './api';
import { Word, LocalWord, useAppStore } from '../store/useAppStore';

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

export function pickWinner(a: Word, b: Word): Word {
  if (a.reviewCount !== b.reviewCount) {
    return a.reviewCount > b.reviewCount ? a : b;
  }
  if (a.lastReview && b.lastReview) {
    return new Date(a.lastReview) > new Date(b.lastReview) ? a : b;
  }
  if (a.lastReview && !b.lastReview) return a;
  if (!a.lastReview && b.lastReview) return b;
  return new Date(a.dateAdded) <= new Date(b.dateAdded) ? a : b;
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
      const winner = pickWinner(existing, l);
      result.set(key, { ...winner, id: existing.id });
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

  const now = new Date().toISOString();
  const draftWords: Word[] = validDrafts.map((entry) => ({
    id: Crypto.randomUUID(),
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
  }));

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
    await replaceAllWords(merged);

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
    const queue = await getSyncQueue();
    if (queue.length === 0) {
      isSyncing = false;
      return { success: true, queueEmpty: true };
    }

    const payload = queue.map((item: any) => ({
      ...item,
      data: JSON.parse(item.data),
    }));

    const response = await api.sync.push(payload);

    if (response && response.success) {
      if (response.successIds && response.successIds.length > 0) {
        await removeSyncQueueItems(response.successIds);
        console.log(`Synced ${response.successIds.length}/${queue.length} items. Failed items will retry.`);
      } else {
        await clearSyncQueue();
        console.log(`Successfully synced ${queue.length} offline items`);
      }
      await setSyncMetadata('last_push_at', new Date().toISOString());
      const remainingQueue = await getSyncQueue();
      return {
        success: true,
        queueEmpty: remainingQueue.length === 0,
      };
    }
    return { success: false, queueEmpty: false };
  } catch (error) {
    console.error('Failed to sync offline queue', error);
    return { success: false, queueEmpty: false };
  } finally {
    isSyncing = false;
  }
};

export const initSyncListener = (isAuthenticated: boolean) => {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      triggerSync(isAuthenticated);
    }
  });
};
