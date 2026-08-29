import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<any> | null = null;

// Initialize the database asynchronously
export const initDB = () => {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('wordroot.db');

      // Create tables if they don't exist
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS words (
          id TEXT PRIMARY KEY NOT NULL,
          word TEXT NOT NULL,
          meaning TEXT NOT NULL,
          dateAdded TEXT NOT NULL,
          fsrsStability REAL NOT NULL,
          fsrsDifficulty REAL NOT NULL,
          fsrsLapses INTEGER NOT NULL,
          fsrsReps INTEGER NOT NULL,
          fsrsState TEXT NOT NULL,
          lastReview TEXT,
          nextReview TEXT NOT NULL,
          reviewCount INTEGER NOT NULL
        );
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          wordId TEXT NOT NULL,
          action TEXT NOT NULL, -- 'review', 'add', 'update', 'delete'
          data TEXT NOT NULL, -- JSON payload of the action
          timestamp TEXT NOT NULL
        );
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS sync_metadata (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);

      return db;
    })();
  }
  return dbPromise;
};

// Helper to get the database instance
export const getDB = () => {
  if (!dbPromise) {
    return initDB();
  }
  return dbPromise;
};
