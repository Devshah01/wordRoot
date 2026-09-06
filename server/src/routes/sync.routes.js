const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.middleware');
const prisma = require('../services/db.service');
const { z } = require('zod');

// --- Zod Schemas ---

const fsrsSchema = z.object({
  fsrsStability: z.number().optional(),
  fsrsDifficulty: z.number().optional(),
  fsrsLapses: z.number().int().optional(),
  fsrsReps: z.number().int().optional(),
  fsrsState: z.string().optional(),
  lastReview: z.coerce.date().nullable().optional(),
  nextReview: z.coerce.date().nullable().optional(),
  reviewCount: z.number().int().optional(),
});

const addDataSchema = fsrsSchema.extend({
  word: z.string().min(1, "Word is required"),
  meaning: z.string().min(1, "Meaning is required"),
  dateAdded: z.coerce.date().optional(),
});

const updatedWordSchema = fsrsSchema.extend({
  word: z.string().min(1).optional(),
  meaning: z.string().min(1).optional(),
  dateAdded: z.coerce.date().optional(),
});

const syncItemSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  wordId: z.string().min(1, 'Missing wordId'),
  action: z.enum(['add', 'update', 'review', 'delete']),
  data: z.any().optional(),
});

const syncQueueSchema = z.array(syncItemSchema);

router.use(authenticateToken); // Protect all routes

// Sync endpoint to batch update words from offline queue
router.post('/', async (req, res) => {
  try {
    const { syncQueue: rawSyncQueue } = req.body;
    const userId = req.user.id;

    // Validate the outer array structure first
    const queueValidation = syncQueueSchema.safeParse(rawSyncQueue);
    if (!queueValidation.success) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid syncQueue format', 
        errors: queueValidation.error.errors 
      });
    }

    const syncQueue = queueValidation.data;

    if (syncQueue.length === 0) {
      return res.json({ success: true, message: 'No items to sync' });
    }

    let successCount = 0;
    let failCount = 0;
    const successIds = [];

    for (const item of syncQueue) {
      try {
        const { action, data, wordId } = item;

        if (action === 'add') {
          // Validate add data
          const parsedData = addDataSchema.parse(data);
          
          const wordKey = parsedData.word.trim().toLowerCase();
          const dateAdded = parsedData.dateAdded || new Date();
          const lastReview = parsedData.lastReview || null;
          const nextReview = parsedData.nextReview || dateAdded;

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
                meaning: parsedData.meaning.trim(),
                fsrsStability: parsedData.fsrsStability,
                fsrsDifficulty: parsedData.fsrsDifficulty,
                fsrsLapses: parsedData.fsrsLapses,
                fsrsReps: parsedData.fsrsReps,
                fsrsState: parsedData.fsrsState,
                lastReview: parsedData.lastReview,
                nextReview: parsedData.nextReview,
                reviewCount: parsedData.reviewCount,
              },
            });
          } else {
            await prisma.word.create({
              data: {
                id: wordId,
                userId,
                word: wordKey,
                meaning: parsedData.meaning.trim(),
                dateAdded,
                fsrsStability: parsedData.fsrsStability ?? 1.0,
                fsrsDifficulty: parsedData.fsrsDifficulty ?? 5.0,
                fsrsLapses: parsedData.fsrsLapses ?? 0,
                fsrsReps: parsedData.fsrsReps ?? 0,
                fsrsState: parsedData.fsrsState || 'New',
                lastReview,
                nextReview,
                reviewCount: parsedData.reviewCount ?? 0,
              },
            });
          }
        } else if (action === 'update' || action === 'review') {
          const rawUpdatedWord = data?.updatedWord || data;
          if (!rawUpdatedWord) {
            throw new Error('Missing payload data for update/review action');
          }
          
          // Validate update data
          const parsedData = updatedWordSchema.parse(rawUpdatedWord);
          const wordKey = parsedData.word ? parsedData.word.trim().toLowerCase() : undefined;
          
          const orConditions = [{ id: wordId }];
          if (wordKey) {
            orConditions.push({ word: wordKey });
          }

          const updateResult = await prisma.word.updateMany({
            where: {
              userId,
              OR: orConditions,
            },
            data: {
              word: wordKey,
              meaning: parsedData.meaning ? parsedData.meaning.trim() : undefined,
              fsrsStability: parsedData.fsrsStability,
              fsrsDifficulty: parsedData.fsrsDifficulty,
              fsrsLapses: parsedData.fsrsLapses,
              fsrsReps: parsedData.fsrsReps,
              fsrsState: parsedData.fsrsState,
              lastReview: parsedData.lastReview,
              nextReview: parsedData.nextReview,
              reviewCount: parsedData.reviewCount,
            },
          });

          // If no existing row was matched and word text + meaning are present, upsert to prevent review loss
          if (updateResult.count === 0) {
            if (wordKey && parsedData.meaning) {
              await prisma.word.create({
                data: {
                  id: wordId,
                  userId,
                  word: wordKey,
                  meaning: parsedData.meaning.trim(),
                  dateAdded: parsedData.dateAdded || new Date(),
                  fsrsStability: parsedData.fsrsStability ?? 1.0,
                  fsrsDifficulty: parsedData.fsrsDifficulty ?? 5.0,
                  fsrsLapses: parsedData.fsrsLapses ?? 0,
                  fsrsReps: parsedData.fsrsReps ?? 0,
                  fsrsState: parsedData.fsrsState || 'New',
                  lastReview: parsedData.lastReview || null,
                  nextReview: parsedData.nextReview || new Date(),
                  reviewCount: parsedData.reviewCount ?? 0,
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
        }

        successCount++;
        if (item.id) successIds.push(item.id);
      } catch (err) {
        console.error(`Failed to process sync item for wordId ${item?.wordId || 'unknown'}:`, err.message || err);
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
