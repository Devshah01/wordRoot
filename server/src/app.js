const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const wordRoutes = require('./routes/word.routes');
const syncRoutes = require('./routes/sync.routes');

const app = express();

// Trust reverse proxy dynamically based on environment
// Google Cloud Run (standalone): 1 hop (Google Front End)
// Google Cloud Run + Cloudflare CDN: 2 hops
// Local Development: false (0 hops)
const getTrustProxyHops = () => {
  const envVal = process.env.TRUST_PROXY;
  if (envVal !== undefined && envVal !== '') {
    if (envVal === 'true') return true;
    if (envVal === 'false') return false;
    const parsed = parseInt(envVal, 10);
    return isNaN(parsed) ? envVal : parsed;
  }
  // Default: 1 hop for production (Cloud Run GFE), false for local development
  return process.env.NODE_ENV === 'production' ? 1 : false;
};

app.set('trust proxy', getTrustProxyHops());

app.use(helmet());
app.use(express.json({ limit: '5mb' }));

// Global rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 200, // Limit each IP to 200 requests per window (15 minutes)
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
app.use(limiter);

const prisma = require('./services/db.service');

app.get('/health', async (req, res) => {
  try {
    // Verify database connectivity
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      db: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check DB error:', error?.message || error);
    res.status(503).json({
      status: 'error',
      db: 'disconnected',
      error: 'Database unreachable',
      timestamp: new Date().toISOString(),
    });
  }
});

// Auth + cloud sync only (app is offline-first)
app.use('/api/auth', authRoutes);
app.use('/api/words', wordRoutes);
app.use('/api/sync', syncRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
