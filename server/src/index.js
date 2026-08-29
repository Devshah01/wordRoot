require('dotenv').config();
const app = require('./app');
const prisma = require('./services/db.service');
const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[wordRoot Server] Running on http://localhost:${PORT}`);
});

// Graceful shutdown handling for Cloud Run
const shutdown = async () => {
  console.log('Shutting down server...');
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
