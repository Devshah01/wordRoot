const prisma = require('../services/db.service');

// Fetch vocabulary words for the authenticated user with cursor/offset pagination support
async function getWords(req, res) {
  try {
    const userId = req.user.id;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 2000);
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const page = req.query.page ? parseInt(req.query.page, 10) : null;

    const queryOptions = {
      where: { userId },
      take: limit + 1, // Fetch 1 extra to check if there are more records
      orderBy: { id: 'asc' },
    };

    if (cursor) {
      queryOptions.cursor = { id: cursor };
      queryOptions.skip = 1;
    } else if (page && page > 1) {
      queryOptions.skip = (page - 1) * limit;
      queryOptions.take = limit;
    }

    const words = await prisma.word.findMany(queryOptions);

    let hasMore = false;
    let nextCursor = null;

    if (!page && words.length > limit) {
      hasMore = true;
      words.pop(); // Remove the extra record
      nextCursor = words[words.length - 1]?.id || null;
    }

    // If client requested paginated metadata format or sent pagination params
    if (req.query.paginated === 'true' || cursor || page) {
      return res.json({
        words,
        hasMore,
        nextCursor,
        count: words.length,
      });
    }

    // Backward-compatible array response for non-paginated requests
    res.json(words);
  } catch (error) {
    console.error('Fetch words error:', error);
    res.status(500).json({ error: 'Failed to fetch words' });
  }
}

module.exports = {
  getWords,
};
