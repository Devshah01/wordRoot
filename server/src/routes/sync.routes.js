const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth.middleware');
const prisma = require('../services/db.service');
const { z } = require('zod');

function getDeterministicWordId(userId, rawWord) {
  const normalizedWord = rawWord.trim().toLowerCase().normalize('NFC');
  const canonicalString = `${userId}:${normalizedWord}`;
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

// --- Zod Schemas ---

const validCoercedDate = z.coerce
  .date()
  .refine((val) => !val || !isNaN(val.getTime()), {
    message: 'Invalid date format',
  });

const fsrsSchema = z.object({
  fsrsStability: z.number().optional(),
  fsrsDifficulty: z.number().optional(),
  fsrsLapses: z.number().int().optional(),
  fsrsReps: z.number().int().optional(),
  fsrsState: z.string().optional(),
  lastReview: validCoercedDate.nullable().optional(),
  nextReview: validCoercedDate.nullable().optional(),
  reviewCount: z.number().int().optional(),
});

const addDataSchema = fsrsSchema.extend({
  word: z.string().min(1, "Word is required").max(100, "Word must be 100 characters or less"),
  meaning: z.string().min(1, "Meaning is required").max(500, "Meaning must be 500 characters or less"),
  dateAdded: validCoercedDate.optional(),
});

const updatedWordSchema = fsrsSchema.extend({
  word: z.string().min(1).max(100, "Word must be 100 characters or less").optional(),
  meaning: z.string().min(1).max(500, "Meaning must be 500 characters or less").optional(),
  dateAdded: validCoercedDate.optional(),
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
          const canonicalId = wordId || getDeterministicWordId(userId, wordKey);
          const dateAdded = parsedData.dateAdded || new Date();
          const lastReview = parsedData.lastReview || null;
          const nextReview = parsedData.nextReview || dateAdded;

          await prisma.word.upsert({
            where: {
              userId_word: {
                userId,
                word: wordKey,
              },
            },
            update: {
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
            create: {
              id: canonicalId,
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

          const updateData = {
            fsrsStability: parsedData.fsrsStability,
            fsrsDifficulty: parsedData.fsrsDifficulty,
            fsrsLapses: parsedData.fsrsLapses,
            fsrsReps: parsedData.fsrsReps,
            fsrsState: parsedData.fsrsState,
            lastReview: parsedData.lastReview,
            nextReview: parsedData.nextReview,
            reviewCount: parsedData.reviewCount,
          };

          if (wordKey !== undefined) {
            updateData.word = wordKey;
          }
          if (parsedData.meaning !== undefined) {
            updateData.meaning = parsedData.meaning.trim();
          }

          const updateResult = await prisma.word.updateMany({
            where: {
              userId,
              OR: orConditions,
            },
            data: updateData,
          });

          // If no existing row was matched and word text + meaning are present, upsert to prevent review loss
          if (updateResult.count === 0) {
            if (wordKey && parsedData.meaning) {
              const canonicalId = wordId || getDeterministicWordId(userId, wordKey);
              try {
                await prisma.word.create({
                  data: {
                    id: canonicalId,
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
              } catch (createErr) {
                if (createErr.code === 'P2002') {
                  await prisma.word.update({
                    where: {
                      userId_word: {
                        userId,
                        word: wordKey,
                      },
                    },
                    data: updateData,
                  });
                } else {
                  throw createErr;
                }
              }
            } else if (wordKey) {
              await prisma.word.update({
                where: {
                  userId_word: {
                    userId,
                    word: wordKey,
                  },
                },
                data: updateData,
              });
            } else {
              throw new Error(`Word not found for update (wordId: ${wordId})`);
            }
          }
        } else if (action === 'delete') {
          const wordKey = typeof data?.word === 'string' ? data.word.trim().toLowerCase() : '';
          let deletedCount = 0;

          if (wordKey) {
            const result = await prisma.word.deleteMany({
              where: {
                userId,
                word: wordKey,
              },
            });
            deletedCount = result.count;
          }

          if (deletedCount === 0 && wordId) {
            await prisma.word.deleteMany({
              where: {
                userId,
                id: wordId,
              },
            });
          }
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
