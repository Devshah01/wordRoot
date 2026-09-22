import { fsrs, generatorParameters, Rating, State, FSRSParameters } from 'ts-fsrs';
import { Word } from '../store/useAppStore';

// Initialize FSRS with default parameters
const params: FSRSParameters = generatorParameters({ enable_fuzz: true });
const f = fsrs(params);

const MS_PER_HOUR = 1000 * 60 * 60;
const CUTOFF_HOUR = 4; // Anki-style 4:00 AM day rollover

/**
 * Safely parses a Date object, ISO timestamp string, or YYYY-MM-DD date-only string.
 * Prevents UTC midnight strings ("YYYY-MM-DD" or "YYYY-MM-DDT00:00:00.000Z") from shifting
 * calendar dates backwards in negative UTC offsets or prematurely triggering the 4:00 AM cutoff.
 */
export const parseSafeDate = (rawDate: string | Date | null | undefined): Date | null => {
  if (!rawDate) return null;
  if (rawDate instanceof Date) {
    return isNaN(rawDate.getTime()) ? null : rawDate;
  }
  if (typeof rawDate !== 'string') return null;

  const trimmed = rawDate.trim();
  if (!trimmed) return null;

  // Match date-only strings or synthetic midnight ISO strings (e.g. "2026-06-01", "2026-06-01T00:00:00.000Z")
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00:00(?:\.000)?(?:Z|[+-]00:00)?)?$/);
  if (dateOnlyMatch) {
    const year = parseInt(dateOnlyMatch[1], 10);
    const month = parseInt(dateOnlyMatch[2], 10) - 1;
    const day = parseInt(dateOnlyMatch[3], 10);
    // Anchor to local midday (12:00) to firmly preserve the intended calendar date across timezones
    return new Date(year, month, day, 12, 0, 0, 0);
  }

  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Converts a Date or date string into an Anki/SuperMemo-style Integer Study Day number.
 * Hours before 4:00 AM local time are attributed to the previous calendar day.
 * Returns the number of discrete days elapsed since Unix epoch in local study calendar days.
 */
export const getStudyDayNumber = (dateInput: Date | string | null | undefined): number => {
  const d = parseSafeDate(dateInput);
  if (!d) return 0;

  const localDate = new Date(d.getTime());
  if (localDate.getHours() < CUTOFF_HOUR) {
    localDate.setDate(localDate.getDate() - 1);
  }

  return Math.floor(
    Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate()) / (1000 * 60 * 60 * 24)
  );
};

/**
 * Calculates the difference in integer study days between two dates using Anki's integer day model.
 * Includes a 4-hour intra-session minimum guard (if less than 4 hours passed in real time, treat as 0 days elapsed).
 */
export const getCalendarDaysDifference = (
  laterDateInput: Date | string | null | undefined,
  earlierDateInput: Date | string | null | undefined
): number => {
  const dLater = parseSafeDate(laterDateInput);
  const dEarlier = parseSafeDate(earlierDateInput);

  if (!dLater || !dEarlier) return 0;

  const msPassed = dLater.getTime() - dEarlier.getTime();
  const hoursPassed = msPassed / MS_PER_HOUR;

  // Guard against intra-session reviews crossing midnight or cutoff:
  // If less than 4 hours passed between reviews, treat as 0 days elapsed.
  if (hoursPassed < 4 && hoursPassed >= 0) {
    return 0;
  }

  const laterDay = getStudyDayNumber(dLater);
  const earlierDay = getStudyDayNumber(dEarlier);

  return Math.max(0, laterDay - earlierDay);
};

export const calculateNextFSRSState = (word: Word, ratingString: 'remember' | 'forgot'): Word => {
  const now = new Date();
  
  // Calculate elapsed_days and scheduled_days accurately for ts-fsrs (calendar day difference)
  const lastReviewDate = parseSafeDate(word.lastReview);
  const nextReviewDate = parseSafeDate(word.nextReview) || now;

  const elapsed_days = lastReviewDate
    ? Math.max(0, getCalendarDaysDifference(now, lastReviewDate))
    : 0;

  const scheduled_days = (lastReviewDate && nextReviewDate)
    ? Math.max(1, getCalendarDaysDifference(nextReviewDate, lastReviewDate))
    : 0;

  // Convert our flat DB state to a ts-fsrs Card object
  const card: any = {
    due: nextReviewDate,
    stability: word.fsrsStability || 1.0,
    difficulty: word.fsrsDifficulty || 5.0,
    elapsed_days,
    scheduled_days,
    reps: word.fsrsReps,
    lapses: word.fsrsLapses,
    state: stringToState(word.fsrsState),
    last_review: lastReviewDate || undefined,
    learning_steps: [],
  };

  // Determine rating enum
  const rating = ratingString === 'remember' ? Rating.Good : Rating.Again;

  // Calculate new state
  const schedulingInfo = f.repeat(card, now);
  const nextLog = schedulingInfo[rating];

  if (!nextLog || !nextLog.card) {
    throw new Error('Failed to calculate next FSRS state');
  }

  const nextCard = nextLog.card;

  return {
    ...word,
    fsrsStability: nextCard.stability,
    fsrsDifficulty: nextCard.difficulty,
    fsrsLapses: nextCard.lapses,
    fsrsReps: nextCard.reps,
    fsrsState: stateToString(nextCard.state),
    lastReview: now.toISOString(),
    nextReview: nextCard.due.toISOString(),
    reviewCount: word.reviewCount + 1,
  };
};

const stringToState = (s: string): State => {
  switch (s) {
    case 'New': return State.New;
    case 'Learning': return State.Learning;
    case 'Review': return State.Review;
    case 'Relearning': return State.Relearning;
    default: return State.New;
  }
};

const stateToString = (s: State): string => {
  switch (s) {
    case State.New: return 'New';
    case State.Learning: return 'Learning';
    case State.Review: return 'Review';
    case State.Relearning: return 'Relearning';
    default: return 'New';
  }
};
