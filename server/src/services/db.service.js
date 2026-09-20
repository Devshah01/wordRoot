const { PrismaClient } = require('@prisma/client');

const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// Layerbase Free Plan Rule:
// - A Free database sleeps after 15 minutes of ZERO connections.
// - Must be asleep at least 25% of any rolling 7-day window.
//
// By automatically closing Prisma's connection pool after 2 minutes of query inactivity,
// we ensure the database is never held open by an idle Node.js server.
// When an app user makes a request, Prisma seamlessly re-connects on the fly.
const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
let idleTimer = null;

function scheduleIdleDisconnect() {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }

  idleTimer = setTimeout(async () => {
    try {
      console.log('[db.service] 2 minutes of inactivity with 0 queries. Disconnecting Prisma connections to allow Layerbase database sleep...');
      await basePrisma.$disconnect();
      console.log('[db.service] Database connections closed. Database will sleep after 15m idle.');
    } catch (err) {
      console.error('[db.service] Error during idle disconnect:', err?.message || err);
    }
  }, IDLE_TIMEOUT_MS);

  // Unref ensures this timer does not block Node.js from exiting if the server is shutting down
  if (idleTimer.unref) {
    idleTimer.unref();
  }
}

function touchActivity() {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  scheduleIdleDisconnect();
}

// Extend Prisma to intercept all model operations and manage the connection lifecycle
const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ operation, model, args, query }) {
        touchActivity();
        try {
          return await query(args);
        } finally {
          touchActivity();
        }
      },
    },
  },
});

// Forward lifecycle and raw query methods
prisma.$disconnect = async () => {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  return basePrisma.$disconnect();
};

prisma.$connect = async () => {
  touchActivity();
  return basePrisma.$connect();
};

const originalQueryRaw = basePrisma.$queryRaw.bind(basePrisma);
prisma.$queryRaw = async (...args) => {
  touchActivity();
  try {
    return await originalQueryRaw(...args);
  } finally {
    touchActivity();
  }
};

const originalExecuteRaw = basePrisma.$executeRaw.bind(basePrisma);
prisma.$executeRaw = async (...args) => {
  touchActivity();
  try {
    return await originalExecuteRaw(...args);
  } finally {
    touchActivity();
  }
};

module.exports = prisma;
