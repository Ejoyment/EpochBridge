import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';

let db: Database.Database | null = null;

export function getLegacyDb(): Database.Database {
  if (db) return db;

  const dbPath = path.resolve(config.legacyDb.path);
  const dir = path.dirname(dbPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  logger.info(`[LegacyDB] Connecting to legacy database at: ${dbPath}`);
  db = new Database(dbPath);

  // Enable WAL mode for better read concurrency (mimics mainframe read-heavy workloads)
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  logger.info('[LegacyDB] Connection established — WAL mode enabled');
  return db;
}

export function closeLegacyDb(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('[LegacyDB] Connection closed');
  }
}
