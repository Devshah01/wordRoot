#!/bin/sh

# Serverless Database Wake-up Retry Script
# Free tier databases go to sleep when idle. We first wake it up via the pooled connection.

MAX_RETRIES=12
RETRY_COUNT=0
SLEEP_TIME=5

echo "Starting database wake-up sequence via Pooled connection..."

# Function to ping the database using the Prisma Client (which uses DATABASE_URL / Pooled)
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

echo "✅ Migrations complete. Starting Node.js server..."
exec npm start
