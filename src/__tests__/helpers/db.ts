import Database from 'better-sqlite3';
import { seedTestData } from './seed';

let testDb: Database.Database | null = null;

export function getTestDb(): Database.Database {
  if (testDb) return testDb;

  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');

  seedTestData(testDb);
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
