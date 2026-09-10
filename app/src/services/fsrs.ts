import { fsrs, generatorParameters, Rating, State, FSRSParameters } from 'ts-fsrs';
import { Word } from '../store/useAppStore';

// Initialize FSRS with default parameters
const params: FSRSParameters = generatorParameters({ enable_fuzz: true });
const f = fsrs(params);

const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;
const CUTOFF_HOUR = 4; // Anki-style 4:00 AM day rollover

/**
 * Gets the adjusted "Study Date" for FSRS where hours before 4 AM belong to the previous date.
 */
const getStudyDate = (d: Date): Date => {
  const adjusted = new Date(d);
  if (adjusted.getHours() < CUTOFF_HOUR) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  return new Date(adjusted.getFullYear(), adjusted.getMonth(), adjusted.getDate());
};

/**
 * Calculates calendar days difference between two dates using an Anki-style 4:00 AM cutoff
 * and a 4-hour intra-session minimum threshold guard.
 */
const getCalendarDaysDifference = (laterDate: Date, earlierDate: Date): number => {
  const hoursPassed = (laterDate.getTime() - earlierDate.getTime()) / MS_PER_HOUR;
  
  // Guard against intra-session reviews crossing midnight or cutoff:
  // If less than 4 hours passed between reviews, treat as 0 days elapsed.
  if (hoursPassed < 4) {
    return 0;
  }

  const d1 = getStudyDate(laterDate);
  const d2 = getStudyDate(earlierDate);

  return Math.max(0, Math.round((d1.getTime() - d2.getTime()) / MS_PER_DAY));
};

export const calculateNextFSRSState = (word: Word, ratingString: 'remember' | 'forgot'): Word => {
  const now = new Date();
  
  // Calculate elapsed_days and scheduled_days accurately for ts-fsrs (calendar day difference)
  const lastReviewDate = word.lastReview ? new Date(word.lastReview) : null;
  const nextReviewDate = word.nextReview ? new Date(word.nextReview) : now;

  const elapsed_days = lastReviewDate
    ? Math.max(0, getCalendarDaysDifference(now, lastReviewDate))
    : 0;

  const scheduled_days = (lastReviewDate && word.nextReview)
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
