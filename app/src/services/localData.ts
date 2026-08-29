import { Word } from '../store/useAppStore';

/**
 * Safely parse a Date instance, ISO string, or YYYY-MM-DD date-only string
 * without UTC off-by-one shifting in non-UTC time zones.
 */
export function parseDateSafe(dInput: Date | string = new Date()): Date {
  if (dInput instanceof Date) return dInput;
  if (typeof dInput === 'string') {
    const trimmed = dInput.trim();
    // If format is strictly YYYY-MM-DD (date only), construct local Date directly
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      return new Date(year, month - 1, day);
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Formats a Date or ISO timestamp string into a local 'YYYY-MM-DD' string
 * based on the user's current device timezone.
 */
export function formatLocalDateString(dInput: Date | string = new Date()): string {
  if (typeof dInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dInput.trim())) {
    return dInput.trim();
  }
  const d = parseDateSafe(dInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computeLocalStats(words: Word[]) {
  const today = formatLocalDateString(new Date());
  const wordsAddedToday = words.filter((w) => formatLocalDateString(w.dateAdded) === today).length;
  return { totalWords: words.length, wordsAddedToday };
}

export interface PendingReviewGroup {
  date: string;
  count: number;
  words: Word[];
}

export function computePendingReviewGroups(words: Word[]): PendingReviewGroup[] {
  const now = new Date();
  const nowIso = now.toISOString();
  const pending = words.filter((w) => w.nextReview <= nowIso);
  const grouped: Record<string, PendingReviewGroup> = {};

  pending.forEach((word) => {
    const dateStr = formatLocalDateString(word.dateAdded || now);
    if (!grouped[dateStr]) {
      grouped[dateStr] = { date: dateStr, count: 0, words: [] };
    }
    grouped[dateStr].words.push(word);
    grouped[dateStr].count += 1;
  });

  return Object.values(grouped).sort((a, b) => {
    const da = parseDateSafe(a.date).getTime();
    const db = parseDateSafe(b.date).getTime();
    return da - db;
  });
}



export function computeTotalReviews(words: Word[]): number {
  return words.reduce((sum, w) => sum + (w.reviewCount || 0), 0);
}
