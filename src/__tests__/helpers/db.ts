import Database from 'better-sqlite3';
import crypto from 'crypto';
import { seedTestData } from './seed';

let testDb: Database.Database | null = null;

function hashPassword(password: string): string {
  return crypto.scryptSync(password, 'epochbridge-salt', 64).toString('hex');
}

export function getTestDb(): Database.Database {
  if (testDb) return testDb;

  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');

  seedTestData(testDb);

  testDb.exec(`
    CREATE TABLE IF NOT EXISTS USERS (
      ID           TEXT    PRIMARY KEY,
      USERNAME     TEXT    NOT NULL UNIQUE,
      PASSWORD_HASH TEXT   NOT NULL,
      ROLE         TEXT    DEFAULT 'user',
      CREATED_AT   TEXT    NOT NULL
    );
  `);

  const count = (testDb.prepare('SELECT COUNT(*) as cnt FROM USERS').get() as { cnt: number }).cnt;
  if (count === 0) {
    testDb.prepare('INSERT INTO USERS (ID, USERNAME, PASSWORD_HASH, ROLE, CREATED_AT) VALUES (?, ?, ?, ?, ?)')
      .run('usr-test-admin', 'admin', hashPassword('admin123'), 'admin', '2024-01-01T00:00:00.000Z');
  }

  return testDb;
}

export function closeTestDb(): void {
  if (testDb) {
    testDb.close();
    testDb = null;
  }
}

export function resetTestDb(): void {
  closeTestDb();
}
