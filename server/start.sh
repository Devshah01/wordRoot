#!/bin/sh

# Serverless Database Wake-up Retry Script
# Free tier databases (like Neon, Layerbase, Supabase) go to sleep when idle.
# This script retries the Prisma migration command to give the database time to wake up.

MAX_RETRIES=6
RETRY_COUNT=0
SLEEP_TIME=5

echo "Starting database connection check & migration..."

until npx prisma migrate deploy; do
  RETRY_COUNT=$((RETRY_COUNT+1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "❌ Database failed to wake up after $MAX_RETRIES attempts."
    exit 1
  fi
  
  echo "⚠️ Database might be sleeping. Retrying in $SLEEP_TIME seconds (Attempt $RETRY_COUNT of $MAX_RETRIES)..."
  sleep $SLEEP_TIME
done

echo "✅ Database is awake and migrations are applied. Starting Node.js server..."
exec npm start
