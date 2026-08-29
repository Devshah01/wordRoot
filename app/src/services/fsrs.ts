import { fsrs, generatorParameters, Rating, State, FSRSParameters } from 'ts-fsrs';
import { Word } from '../store/useAppStore';

// Initialize FSRS with default parameters
const params: FSRSParameters = generatorParameters({ enable_fuzz: true });
const f = fsrs(params);

export const calculateNextFSRSState = (word: Word, ratingString: 'remember' | 'forgot'): Word => {
  const now = new Date();
  
  // Calculate elapsed_days and scheduled_days accurately for ts-fsrs
  const lastReviewDate = word.lastReview ? new Date(word.lastReview) : null;
  const nextReviewDate = word.nextReview ? new Date(word.nextReview) : now;

  const elapsed_days = lastReviewDate
    ? Math.max(0, Math.floor((now.getTime() - lastReviewDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const scheduled_days = (lastReviewDate && word.nextReview)
    ? Math.max(1, Math.floor((nextReviewDate.getTime() - lastReviewDate.getTime()) / (1000 * 60 * 60 * 24)))
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
