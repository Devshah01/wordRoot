const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.middleware');
const prisma = require('../services/db.service');

router.use(authenticateToken); // Protect all routes

// Sync endpoint to batch update words from offline queue
router.post('/', async (req, res) => {
  try {
    const { syncQueue } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(syncQueue) || syncQueue.length === 0) {
      return res.json({ success: true, message: 'No items to sync' });
    }

    // Process each item individually to prevent one failure from rolling back everything
    let successCount = 0;
    let failCount = 0;
    const successIds = [];

    for (const item of syncQueue) {
      try {
        const { action, data, wordId } = item;

        if (!wordId) {
          throw new Error('Missing wordId in sync item');
        }

        if (action === 'add') {
          if (!data || typeof data.word !== 'string' || typeof data.meaning !== 'string') {
            throw new Error('Invalid data for add action');
          }
          const wordKey = data.word.trim().toLowerCase();
          const dateAdded = data.dateAdded ? new Date(data.dateAdded) : new Date();
          const lastReview = data.lastReview ? new Date(data.lastReview) : null;
          const nextReview = data.nextReview ? new Date(data.nextReview) : dateAdded;

          const existing = await prisma.word.findFirst({
            where: {
              userId,
              OR: [
                { id: wordId },
                { word: wordKey },
              ],
            },
          });

          if (existing) {
            await prisma.word.update({
              where: { id: existing.id },
              data: {
                meaning: data.meaning.trim(),
                fsrsStability: data.fsrsStability !== undefined ? data.fsrsStability : undefined,
                fsrsDifficulty: data.fsrsDifficulty !== undefined ? data.fsrsDifficulty : undefined,
                fsrsLapses: data.fsrsLapses !== undefined ? data.fsrsLapses : undefined,
                fsrsReps: data.fsrsReps !== undefined ? data.fsrsReps : undefined,
                fsrsState: data.fsrsState || undefined,
                lastReview: data.lastReview ? new Date(data.lastReview) : undefined,
                nextReview: data.nextReview ? new Date(data.nextReview) : undefined,
                reviewCount: data.reviewCount !== undefined ? data.reviewCount : undefined,
              },
            });
          } else {
            await prisma.word.create({
              data: {
                id: wordId,
                userId,
                word: wordKey,
                meaning: data.meaning.trim(),
                dateAdded,
                fsrsStability: data.fsrsStability !== undefined ? data.fsrsStability : 1.0,
                fsrsDifficulty: data.fsrsDifficulty !== undefined ? data.fsrsDifficulty : 5.0,
                fsrsLapses: data.fsrsLapses !== undefined ? data.fsrsLapses : 0,
                fsrsReps: data.fsrsReps !== undefined ? data.fsrsReps : 0,
                fsrsState: data.fsrsState || 'New',
                lastReview,
                nextReview,
                reviewCount: data.reviewCount !== undefined ? data.reviewCount : 0,
              },
            });
          }
        } else if (action === 'update' || action === 'review') {
          const updatedWord = data?.updatedWord || data;
          if (!updatedWord) {
            throw new Error('Missing payload data for update/review action');
          }
          const wordKey = typeof updatedWord.word === 'string' ? updatedWord.word.trim().toLowerCase() : '';
          const orConditions = [{ id: wordId }];
          if (wordKey) {
            orConditions.push({ word: wordKey });
          }

          const lastReviewVal = updatedWord.lastReview !== undefined
            ? (updatedWord.lastReview ? new Date(updatedWord.lastReview) : null)
            : undefined;
          const nextReviewVal = updatedWord.nextReview !== undefined
            ? (updatedWord.nextReview ? new Date(updatedWord.nextReview) : undefined)
            : undefined;

          const updateResult = await prisma.word.updateMany({
            where: {
              userId,
              OR: orConditions,
            },
            data: {
              word: wordKey || undefined,
              meaning: typeof updatedWord.meaning === 'string' ? updatedWord.meaning.trim() : undefined,
              fsrsStability: updatedWord.fsrsStability,
              fsrsDifficulty: updatedWord.fsrsDifficulty,
              fsrsLapses: updatedWord.fsrsLapses,
              fsrsReps: updatedWord.fsrsReps,
              fsrsState: updatedWord.fsrsState,
              lastReview: lastReviewVal,
              nextReview: nextReviewVal,
              reviewCount: updatedWord.reviewCount,
            },
          });

          // If no existing row was matched and word text + meaning are present, upsert to prevent review loss
          if (updateResult.count === 0) {
            if (wordKey && typeof updatedWord.meaning === 'string') {
              await prisma.word.create({
                data: {
                  id: wordId,
                  userId,
                  word: wordKey,
                  meaning: updatedWord.meaning.trim(),
                  dateAdded: updatedWord.dateAdded ? new Date(updatedWord.dateAdded) : new Date(),
                  fsrsStability: updatedWord.fsrsStability !== undefined ? updatedWord.fsrsStability : 1.0,
                  fsrsDifficulty: updatedWord.fsrsDifficulty !== undefined ? updatedWord.fsrsDifficulty : 5.0,
                  fsrsLapses: updatedWord.fsrsLapses !== undefined ? updatedWord.fsrsLapses : 0,
                  fsrsReps: updatedWord.fsrsReps !== undefined ? updatedWord.fsrsReps : 0,
                  fsrsState: updatedWord.fsrsState || 'New',
                  lastReview: lastReviewVal || null,
                  nextReview: nextReviewVal || new Date(),
                  reviewCount: updatedWord.reviewCount !== undefined ? updatedWord.reviewCount : 0,
                },
              });
            } else {
              throw new Error(`Word not found for update (wordId: ${wordId})`);
            }
          }
        } else if (action === 'delete') {
          const wordKey = typeof data?.word === 'string' ? data.word.trim().toLowerCase() : '';
          const orConditions = [{ id: wordId }];
          if (wordKey) {
            orConditions.push({ word: wordKey });
          }

          await prisma.word.deleteMany({
            where: {
              userId,
              OR: orConditions,
            },
          });
        } else {
          throw new Error(`Unsupported sync action: "${action}"`);
        }

        successCount++;
        if (item.id) successIds.push(item.id);
      } catch (err) {
        console.error(`Failed to process sync item for wordId ${item.wordId}:`, err);
        failCount++;
      }
    }

    res.json({
      success: true,
      message: 'Sync completed',
      syncedItems: successCount,
      failedItems: failCount,
      successIds,
    });
  } catch (error) {
    console.error('Error during sync:', error);
    res.status(500).json({ error: 'Failed to synchronize with server' });
  }
});

module.exports = router;
