const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const wordRoutes = require('./routes/word.routes');
const syncRoutes = require('./routes/sync.routes');
const prisma = require('./services/db.service');

const app = express();

// Trust reverse proxy (Cloud Run, Render, Railway, AWS, Nginx)
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json({ limit: '5mb' }));

// Lightweight health check endpoint for uptime monitors & Cloud Run keep-alive.
// CRITICAL: Does NOT query the database, allowing free-tier databases (e.g. Layerbase)
// to sleep naturally when idle to comply with the 25%+ sleep rule.
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Deep diagnostic check: Only use manually when troubleshooting DB connectivity.
// Do NOT point external cron jobs or uptime monitors to this endpoint.
app.get('/health/db', async (req, res) => {
  try {
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

// Global rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 200, // Limit each IP to 200 requests per window (15 minutes)
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
app.use(limiter);

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
