/**
 * EpochBridge — CDC Kafka Producer
 *
 * Watches the legacy SQLite database for changes by polling a change-log
 * trigger table (CHANGE_LOG). In a real AS/400 deployment this is replaced
 * by a Debezium connector reading DB2 journal entries or RNRLIB journal
 * receivers — same Kafka message contract, different source adapter.
 */

import { Kafka, Producer, CompressionTypes } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getLegacyDb } from '../legacy-db/connection';
import type { CDCEvent } from '../types';

export class CDCProducer {
  private kafka: Kafka;
  private producer: Producer;
  private pollIntervalMs = 2000;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastChecked: string;
  private isConnected = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      retry: { retries: 5 },
    });
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
    });
    this.lastChecked = new Date().toISOString();
  }

  async connect(): Promise<void> {
    try {
      await this.producer.connect();
      this.isConnected = true;
      logger.info('[CDC Producer] Connected to Kafka brokers');
      this.ensureChangeLogTable();
    } catch (err) {
      logger.warn('[CDC Producer] Kafka not available — running in local pub/sub mode');
      this.isConnected = false;
    }
  }

  /**
   * Install SQLite triggers on all monitored tables so every INSERT/UPDATE/DELETE
   * appends a row to CHANGE_LOG. This simulates the DB2 journal mechanism.
   */
  private ensureChangeLogTable(): void {
    const db = getLegacyDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS CHANGE_LOG (
        LOG_ID      TEXT PRIMARY KEY,
        LOG_TABLE   TEXT NOT NULL,
        LOG_OP      TEXT NOT NULL,    -- INSERT | UPDATE | DELETE
        LOG_BEFORE  TEXT,             -- JSON blob
        LOG_AFTER   TEXT,             -- JSON blob
        LOG_TS      TEXT NOT NULL,
        LOG_SENT    INTEGER DEFAULT 0 -- 0=pending, 1=sent to Kafka
      );

      -- CUSTMAST triggers
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

      -- INVNTRY triggers
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

      -- ORDERHDR triggers
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

    logger.info('[CDC Producer] Change log table and triggers installed');
  }

  /**
   * Start polling the CHANGE_LOG table and publishing pending events to Kafka.
   */
  startPolling(onEvent?: (event: CDCEvent) => void): void {
    this.pollTimer = setInterval(() => {
      this.drainChangeLog(onEvent);
    }, this.pollIntervalMs);

    logger.info(`[CDC Producer] Polling legacy change log every ${this.pollIntervalMs}ms`);
  }

  private drainChangeLog(onEvent?: (event: CDCEvent) => void): void {
    try {
      const db = getLegacyDb();

      const rows = db.prepare(`
        SELECT * FROM CHANGE_LOG WHERE LOG_SENT = 0 ORDER BY LOG_TS ASC LIMIT 100
      `).all() as Array<{
        LOG_ID: string;
        LOG_TABLE: string;
        LOG_OP: string;
        LOG_BEFORE: string | null;
        LOG_AFTER: string | null;
        LOG_TS: string;
      }>;

      if (rows.length === 0) return;

      const markSent = db.prepare(`UPDATE CHANGE_LOG SET LOG_SENT = 1 WHERE LOG_ID = ?`);

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

        // Fire local callback (used when Kafka is unavailable — pure in-process pub/sub)
        if (onEvent) onEvent(event);

        // Publish to Kafka if connected
        if (this.isConnected) {
          this.publish(event).catch((e) =>
            logger.error('[CDC Producer] Kafka publish failed', e)
          );
        }

        markSent.run(row.LOG_ID);
        logger.debug(`[CDC Producer] Emitted ${event.operation} on ${event.table}`);
      }
    } catch (err) {
      logger.error('[CDC Producer] Error draining change log', err);
    }
  }

  async publish(event: CDCEvent): Promise<void> {
    if (!this.isConnected) return;
    await this.producer.send({
      topic: config.kafka.cdcTopic,
      compression: CompressionTypes.GZIP,
      messages: [
        {
          key: `${event.table}:${event.id}`,
          value: JSON.stringify(event),
          headers: {
            'eb-operation': event.operation,
            'eb-table': event.table,
            'eb-version': '1',
          },
        },
      ],
    });
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      logger.info('[CDC Producer] Polling stopped');
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    if (this.isConnected) {
      await this.producer.disconnect();
      logger.info('[CDC Producer] Disconnected from Kafka');
    }
  }
}
