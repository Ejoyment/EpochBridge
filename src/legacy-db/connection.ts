import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

let db: Database.Database | null = null;

function hashPassword(password: string): string {
  return crypto.scryptSync(password, 'epochbridge-salt', 64).toString('hex');
}

function ensureUsersTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS USERS (
      ID           TEXT    PRIMARY KEY,
      USERNAME     TEXT    NOT NULL UNIQUE,
      PASSWORD_HASH TEXT   NOT NULL,
      ROLE         TEXT    DEFAULT 'user',
      CREATED_AT   TEXT    NOT NULL
    );
  `);

  const count = (database.prepare('SELECT COUNT(*) as cnt FROM USERS').get() as { cnt: number }).cnt;
  if (count === 0) {
    const id = 'usr-' + Date.now();
    const now = new Date().toISOString();
    database.prepare('INSERT INTO USERS (ID, USERNAME, PASSWORD_HASH, ROLE, CREATED_AT) VALUES (?, ?, ?, ?, ?)')
      .run(id, 'admin', hashPassword('admin123'), 'admin', now);
    logger.info('[LegacyDB] Created default admin user (admin / admin123)');
  }
}

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

  ensureUsersTable(db);

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

export { hashPassword };
