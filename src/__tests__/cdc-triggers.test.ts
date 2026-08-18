import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { getTestDb, closeTestDb } from './helpers/db';
import type { CDCEvent } from '../types';

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

let db: Database.Database;

beforeAll(() => {
  db = getTestDb();
});

afterAll(() => {
  closeTestDb();
});

function installTriggers(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS CHANGE_LOG (
      LOG_ID      TEXT PRIMARY KEY,
      LOG_TABLE   TEXT NOT NULL,
      LOG_OP      TEXT NOT NULL,
      LOG_BEFORE  TEXT,
      LOG_AFTER   TEXT,
      LOG_TS      TEXT NOT NULL,
      LOG_SENT    INTEGER DEFAULT 0
    );

    CREATE TRIGGER IF NOT EXISTS trg_custmast_insert
    AFTER INSERT ON CUSTMAST BEGIN
      INSERT INTO CHANGE_LOG (LOG_ID, LOG_TABLE, LOG_OP, LOG_BEFORE, LOG_AFTER, LOG_TS)
      VALUES (lower(hex(randomblob(16))), 'CUSTMAST', 'INSERT', NULL,
        json_object(
          'CUST_ID', NEW.CUST_ID, 'CUST_NAME', NEW.CUST_NAME,
          'CUST_STAT', NEW.CUST_STAT, 'CUST_CRDT', NEW.CUST_CRDT
        ), datetime('now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_custmast_update
    AFTER UPDATE ON CUSTMAST BEGIN
      INSERT INTO CHANGE_LOG (LOG_ID, LOG_TABLE, LOG_OP, LOG_BEFORE, LOG_AFTER, LOG_TS)
      VALUES (lower(hex(randomblob(16))), 'CUSTMAST', 'UPDATE',
        json_object(
          'CUST_ID', OLD.CUST_ID, 'CUST_NAME', OLD.CUST_NAME,
          'CUST_STAT', OLD.CUST_STAT, 'CUST_CRDT', OLD.CUST_CRDT
        ),
        json_object(
          'CUST_ID', NEW.CUST_ID, 'CUST_NAME', NEW.CUST_NAME,
          'CUST_STAT', NEW.CUST_STAT, 'CUST_CRDT', NEW.CUST_CRDT
        ), datetime('now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_custmast_delete
    AFTER DELETE ON CUSTMAST BEGIN
      INSERT INTO CHANGE_LOG (LOG_ID, LOG_TABLE, LOG_OP, LOG_BEFORE, LOG_AFTER, LOG_TS)
      VALUES (lower(hex(randomblob(16))), 'CUSTMAST', 'DELETE',
        json_object(
          'CUST_ID', OLD.CUST_ID, 'CUST_NAME', OLD.CUST_NAME,
          'CUST_STAT', OLD.CUST_STAT, 'CUST_CRDT', OLD.CUST_CRDT
        ), NULL, datetime('now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_invntry_insert
    AFTER INSERT ON INVNTRY BEGIN
      INSERT INTO CHANGE_LOG (LOG_ID, LOG_TABLE, LOG_OP, LOG_BEFORE, LOG_AFTER, LOG_TS)
      VALUES (lower(hex(randomblob(16))), 'INVNTRY', 'INSERT', NULL,
        json_object(
          'ITEM_ID', NEW.ITEM_ID, 'ITEM_DESC', NEW.ITEM_DESC,
          'ITEM_QTY', NEW.ITEM_QTY, 'ITEM_PRICE', NEW.ITEM_PRICE
        ), datetime('now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_invntry_update
    AFTER UPDATE ON INVNTRY BEGIN
      INSERT INTO CHANGE_LOG (LOG_ID, LOG_TABLE, LOG_OP, LOG_BEFORE, LOG_AFTER, LOG_TS)
      VALUES (lower(hex(randomblob(16))), 'INVNTRY', 'UPDATE',
        json_object(
          'ITEM_ID', OLD.ITEM_ID, 'ITEM_DESC', OLD.ITEM_DESC,
          'ITEM_QTY', OLD.ITEM_QTY, 'ITEM_PRICE', OLD.ITEM_PRICE
        ),
        json_object(
          'ITEM_ID', NEW.ITEM_ID, 'ITEM_DESC', NEW.ITEM_DESC,
          'ITEM_QTY', NEW.ITEM_QTY, 'ITEM_PRICE', NEW.ITEM_PRICE
        ), datetime('now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_orderhdr_insert
    AFTER INSERT ON ORDERHDR BEGIN
      INSERT INTO CHANGE_LOG (LOG_ID, LOG_TABLE, LOG_OP, LOG_BEFORE, LOG_AFTER, LOG_TS)
      VALUES (lower(hex(randomblob(16))), 'ORDERHDR', 'INSERT', NULL,
        json_object(
          'ORDR_ID', NEW.ORDR_ID, 'CUST_ID', NEW.CUST_ID,
          'ORDR_STAT', NEW.ORDR_STAT, 'ORDR_TOTAL', NEW.ORDR_TOTAL
        ), datetime('now'));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_orderhdr_update
    AFTER UPDATE ON ORDERHDR BEGIN
      INSERT INTO CHANGE_LOG (LOG_ID, LOG_TABLE, LOG_OP, LOG_BEFORE, LOG_AFTER, LOG_TS)
      VALUES (lower(hex(randomblob(16))), 'ORDERHDR', 'UPDATE',
        json_object(
          'ORDR_ID', OLD.ORDR_ID, 'CUST_ID', OLD.CUST_ID,
          'ORDR_STAT', OLD.ORDR_STAT, 'ORDR_TOTAL', OLD.ORDR_TOTAL
        ),
        json_object(
          'ORDR_ID', NEW.ORDR_ID, 'CUST_ID', NEW.CUST_ID,
          'ORDR_STAT', NEW.ORDR_STAT, 'ORDR_TOTAL', NEW.ORDR_TOTAL
        ), datetime('now'));
    END;
  `);
}

describe('CDC Trigger Installation', () => {
  it('creates CHANGE_LOG table', () => {
    installTriggers(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='CHANGE_LOG'").all();
    expect(tables).toHaveLength(1);
  });

  it('creates CUSTMAST triggers (insert, update, delete)', () => {
    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='CUSTMAST'")
      .all() as Array<{ name: string }>;
    const names = triggers.map((t) => t.name);
    expect(names).toContain('trg_custmast_insert');
    expect(names).toContain('trg_custmast_update');
    expect(names).toContain('trg_custmast_delete');
  });

  it('creates INVNTRY triggers (insert, update)', () => {
    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='INVNTRY'")
      .all() as Array<{ name: string }>;
    const names = triggers.map((t) => t.name);
    expect(names).toContain('trg_invntry_insert');
    expect(names).toContain('trg_invntry_update');
  });

  it('creates ORDERHDR triggers (insert, update)', () => {
    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='ORDERHDR'")
      .all() as Array<{ name: string }>;
    const names = triggers.map((t) => t.name);
    expect(names).toContain('trg_orderhdr_insert');
    expect(names).toContain('trg_orderhdr_update');
  });
});

describe('CDC Trigger Firing', () => {
  beforeAll(() => {
    installTriggers(db);
  });

  it('captures INSERT on CUSTMAST', () => {
    db.prepare(
      `INSERT INTO CUSTMAST (CUST_ID, CUST_NAME, CUST_ADDR1, CUST_CITY, CUST_STATE, CUST_ZIP, CUST_PHONE, CUST_CRDT, CUST_STAT, CUST_CRTD, CUST_UPDT)
       VALUES ('C0010', 'TEST CORP', '1 TEST ST', 'TESTVILLE', 'TS', '00000', '5550000', 100000, 'A', '20240101', '20240101')`
    ).run();

    const rows = db.prepare("SELECT * FROM CHANGE_LOG WHERE LOG_TABLE = 'CUSTMAST' AND LOG_OP = 'INSERT'").all() as Array<{
      LOG_OP: string;
      LOG_AFTER: string | null;
    }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const latest = rows[rows.length - 1];
    expect(latest.LOG_OP).toBe('INSERT');
    const after = JSON.parse(latest.LOG_AFTER!);
    expect(after.CUST_ID).toBe('C0010');
    expect(after.CUST_NAME).toBe('TEST CORP');
  });

  it('captures UPDATE on CUSTMAST with before/after', () => {
    db.prepare("UPDATE CUSTMAST SET CUST_STAT = 'S', CUST_UPDT = '20240201' WHERE CUST_ID = 'C0010'").run();

    const rows = db.prepare("SELECT * FROM CHANGE_LOG WHERE LOG_TABLE = 'CUSTMAST' AND LOG_OP = 'UPDATE'").all() as Array<{
      LOG_BEFORE: string | null;
      LOG_AFTER: string | null;
    }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const latest = rows[rows.length - 1];
    const before = JSON.parse(latest.LOG_BEFORE!);
    const after = JSON.parse(latest.LOG_AFTER!);
    expect(before.CUST_STAT).toBe('A');
    expect(after.CUST_STAT).toBe('S');
  });

  it('captures DELETE on CUSTMAST with before data', () => {
    db.prepare("DELETE FROM CUSTMAST WHERE CUST_ID = 'C0010'").run();

    const rows = db.prepare("SELECT * FROM CHANGE_LOG WHERE LOG_TABLE = 'CUSTMAST' AND LOG_OP = 'DELETE'").all() as Array<{
      LOG_BEFORE: string | null;
      LOG_AFTER: string | null;
    }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const latest = rows[rows.length - 1];
    const before = JSON.parse(latest.LOG_BEFORE!);
    expect(before.CUST_ID).toBe('C0010');
    expect(latest.LOG_AFTER).toBeNull();
  });

  it('captures INSERT on INVNTRY', () => {
    db.prepare(
      `INSERT INTO INVNTRY (ITEM_ID, ITEM_DESC, ITEM_UOM, ITEM_QTY, ITEM_COST, ITEM_PRICE, ITEM_WHSE, ITEM_STAT)
       VALUES ('ITM-999', 'TEST ITEM', 'EA', 100, 10.00, 20.00, 'MAIN', 'A')`
    ).run();

    const rows = db.prepare("SELECT * FROM CHANGE_LOG WHERE LOG_TABLE = 'INVNTRY' AND LOG_OP = 'INSERT'").all() as Array<{
      LOG_AFTER: string | null;
    }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const after = JSON.parse(rows[rows.length - 1].LOG_AFTER!);
    expect(after.ITEM_ID).toBe('ITM-999');
  });

  it('captures UPDATE on INVNTRY with before/after', () => {
    db.prepare("UPDATE INVNTRY SET ITEM_QTY = 50 WHERE ITEM_ID = 'ITM-999'").run();

    const rows = db.prepare("SELECT * FROM CHANGE_LOG WHERE LOG_TABLE = 'INVNTRY' AND LOG_OP = 'UPDATE'").all() as Array<{
      LOG_BEFORE: string | null;
      LOG_AFTER: string | null;
    }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const latest = rows[rows.length - 1];
    const before = JSON.parse(latest.LOG_BEFORE!);
    const after = JSON.parse(latest.LOG_AFTER!);
    expect(before.ITEM_QTY).toBe(100);
    expect(after.ITEM_QTY).toBe(50);
  });

  it('captures INSERT on ORDERHDR', () => {
    db.prepare(
      `INSERT INTO ORDERHDR (ORDR_ID, CUST_ID, ORDR_DATE, ORDR_STAT, ORDR_TOTAL, ORDR_NOTES)
       VALUES ('ORD-TEST', 'C0001', '20240101', 'O', 100.00, 'TEST')`
    ).run();

    const rows = db.prepare("SELECT * FROM CHANGE_LOG WHERE LOG_TABLE = 'ORDERHDR' AND LOG_OP = 'INSERT'").all() as Array<{
      LOG_AFTER: string | null;
    }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const after = JSON.parse(rows[rows.length - 1].LOG_AFTER!);
    expect(after.ORDR_ID).toBe('ORD-TEST');
  });
});

describe('CHANGE_LOG Polling (drainChangeLog)', () => {
  function drainChangeLog(
    database: Database.Database,
    onEvent?: (event: CDCEvent) => void
  ): void {
    const rows = database
      .prepare('SELECT * FROM CHANGE_LOG WHERE LOG_SENT = 0 ORDER BY LOG_TS ASC LIMIT 100')
      .all() as Array<{
      LOG_ID: string;
      LOG_TABLE: string;
      LOG_OP: string;
      LOG_BEFORE: string | null;
      LOG_AFTER: string | null;
      LOG_TS: string;
    }>;

    if (rows.length === 0) return;

    const markSent = database.prepare('UPDATE CHANGE_LOG SET LOG_SENT = 1 WHERE LOG_ID = ?');

    for (const row of rows) {
      const event: CDCEvent = {
        id: uuidv4(),
        operation: row.LOG_OP as CDCEvent['operation'],
        table: row.LOG_TABLE,
        database: 'LEGACY_AS400',
        timestamp: new Date(row.LOG_TS).toISOString(),
        before: row.LOG_BEFORE ? JSON.parse(row.LOG_BEFORE) : null,
        after: row.LOG_AFTER ? JSON.parse(row.LOG_AFTER) : null,
        metadata: { logPosition: row.LOG_ID },
      };

      if (onEvent) onEvent(event);
      markSent.run(row.LOG_ID);
    }
  }

  it('processes pending rows and marks them as sent', () => {
    installTriggers(db);

    db.prepare(
      `INSERT INTO CUSTMAST (CUST_ID, CUST_NAME, CUST_ADDR1, CUST_CITY, CUST_STATE, CUST_ZIP, CUST_PHONE, CUST_CRDT, CUST_STAT, CUST_CRTD, CUST_UPDT)
       VALUES ('C0020', 'POLL TEST INC', '1 POLL RD', 'POLLVILLE', 'PL', '11111', '5551111', 50000, 'A', '20240101', '20240101')`
    ).run();

    const pending = db.prepare('SELECT COUNT(*) as cnt FROM CHANGE_LOG WHERE LOG_SENT = 0').get() as { cnt: number };
    expect(pending.cnt).toBeGreaterThanOrEqual(1);

    drainChangeLog(db);

    const stillPending = db.prepare('SELECT COUNT(*) as cnt FROM CHANGE_LOG WHERE LOG_SENT = 0').get() as { cnt: number };
    expect(stillPending.cnt).toBe(0);
  });

  it('fires callback for each pending event', () => {
    const events: CDCEvent[] = [];

    db.prepare(
      `INSERT INTO INVNTRY (ITEM_ID, ITEM_DESC, ITEM_UOM, ITEM_QTY, ITEM_COST, ITEM_PRICE, ITEM_WHSE, ITEM_STAT)
       VALUES ('ITM-888', 'CALLBACK TEST', 'EA', 10, 1.00, 2.00, 'MAIN', 'A')`
    ).run();

    drainChangeLog(db, (event) => events.push(event));

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.table === 'INVNTRY')).toBe(true);
  });

  it('returns early when no pending rows exist', () => {
    const events: CDCEvent[] = [];
    drainChangeLog(db, (event) => events.push(event));
    expect(events).toHaveLength(0);
  });
});
