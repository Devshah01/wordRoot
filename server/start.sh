#!/bin/sh

# Only run database wake-up and migrations if explicitly requested (e.g. during manual schema updates)
# Skipping this during normal container boots ensures the database is NOT woken up unnecessarily,
# complying with Layerbase's 25%+ sleep policy.
if [ "$AUTO_MIGRATE" = "true" ]; then
  MAX_RETRIES=12
  RETRY_COUNT=0
  SLEEP_TIME=5

  echo "AUTO_MIGRATE=true: Starting database wake-up sequence via Pooled connection..."

  ping_db() {
    node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  prisma.\$queryRawUnsafe('SELECT 1').then(() => {
    process.exit(0);
  }).catch((e) => {
    process.exit(1);
  });
  "
  }

  until ping_db; do
    RETRY_COUNT=$((RETRY_COUNT+1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
      echo "❌ Database failed to wake up after $MAX_RETRIES attempts."
      exit 1
    fi
    
    echo "⚠️ Database might be sleeping. Retrying in $SLEEP_TIME seconds (Attempt $RETRY_COUNT of $MAX_RETRIES)..."
    sleep $SLEEP_TIME
  done

  echo "✅ Database is awake! Running migrations via Direct connection..."
  npx prisma migrate deploy
else
  echo "⚡ Fast boot: Skipping database wake-up on start to allow DB sleep (set AUTO_MIGRATE=true if migrations are needed)."
fi

echo "✅ Starting Node.js server..."
exec npm start
