import { v4 as uuidv4 } from 'uuid';
import { pubsub, CDC_TOPIC } from '../cdc/pubsub-bridge';
import { getLegacyDb } from '../legacy-db/connection';
import { introspectLegacyDB, generateSchema } from '../intelligence/schema-generator';
import { logger } from '../utils/logger';
import type { CDCEvent } from '../types';

const startTime = Date.now();
let messagesProcessed = 0;
let lastCDCEvent: string | undefined;
let kafkaConnected = false;
let activeSubscriptions = 0;

export function setKafkaConnected(v: boolean): void { kafkaConnected = v; }
export function incrementMessages(): void { messagesProcessed++; lastCDCEvent = new Date().toISOString(); }

export const resolvers = {
  Query: {
    // ── Customers ──────────────────────────────────────────────────────────
    allCustomers: (_: unknown, args: { limit?: number; offset?: number; status?: string }) => {
      const db = getLegacyDb();
      if (args.status) {
        return db.prepare('SELECT * FROM CUSTMAST WHERE CUST_STAT = ? LIMIT ? OFFSET ?')
          .all(args.status, args.limit ?? 100, args.offset ?? 0);
      }
      return db.prepare('SELECT * FROM CUSTMAST LIMIT ? OFFSET ?')
        .all(args.limit ?? 100, args.offset ?? 0);
    },

    customer: (_: unknown, args: { id: string }) => {
      return getLegacyDb().prepare('SELECT * FROM CUSTMAST WHERE CUST_ID = ?').get(args.id);
    },

    // ── Inventory ──────────────────────────────────────────────────────────
    allInventory: (_: unknown, args: { limit?: number; offset?: number; warehouse?: string }) => {
      const db = getLegacyDb();
      if (args.warehouse) {
        return db.prepare('SELECT * FROM INVNTRY WHERE ITEM_WHSE = ? LIMIT ? OFFSET ?')
          .all(args.warehouse, args.limit ?? 100, args.offset ?? 0);
      }
      return db.prepare('SELECT * FROM INVNTRY LIMIT ? OFFSET ?')
        .all(args.limit ?? 100, args.offset ?? 0);
    },

    inventoryItem: (_: unknown, args: { id: string }) => {
      return getLegacyDb().prepare('SELECT * FROM INVNTRY WHERE ITEM_ID = ?').get(args.id);
    },

    // ── Orders ─────────────────────────────────────────────────────────────
    allOrders: (_: unknown, args: { limit?: number; offset?: number; status?: string }) => {
      const db = getLegacyDb();
      if (args.status) {
        return db.prepare('SELECT * FROM ORDERHDR WHERE ORDR_STAT = ? LIMIT ? OFFSET ?')
          .all(args.status, args.limit ?? 100, args.offset ?? 0);
      }
      return db.prepare('SELECT * FROM ORDERHDR LIMIT ? OFFSET ?')
        .all(args.limit ?? 100, args.offset ?? 0);
    },

    order: (_: unknown, args: { id: string }) => {
      return getLegacyDb().prepare('SELECT * FROM ORDERHDR WHERE ORDR_ID = ?').get(args.id);
    },

    ordersByCustomer: (_: unknown, args: { customerId: string }) => {
      return getLegacyDb()
        .prepare('SELECT * FROM ORDERHDR WHERE CUST_ID = ? ORDER BY ORDR_DATE DESC')
        .all(args.customerId);
    },

    // ── Platform ───────────────────────────────────────────────────────────
    health: () => ({
      status: 'healthy',
      uptime: (Date.now() - startTime) / 1000,
      kafkaConnected,
      legacyDbConnected: true,
      activeSubscriptions,
      messagesProcessed,
      lastCDCEvent,
    }),

    generateSchemaFromLegacyDB: async () => {
      const db = getLegacyDb();
      const legacySchema = introspectLegacyDB(db);
      const artifact = await generateSchema(legacySchema);
      return {
        graphqlTypeDefs: artifact.graphqlTypeDefs,
        typescriptTypes: artifact.typescriptTypes,
        resolverStubs: artifact.resolverStubs,
        generatedAt: artifact.generatedAt,
        llmProvider: artifact.llmProvider,
      };
    },
  },

  // ── Mutations ────────────────────────────────────────────────────────────
  Mutation: {
    updateCustomer: (_: unknown, args: { id: string; status?: string; creditLimit?: number }) => {
      const db = getLegacyDb();
      const now = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      if (args.status !== undefined) {
        db.prepare('UPDATE CUSTMAST SET CUST_STAT = ?, CUST_UPDT = ? WHERE CUST_ID = ?')
          .run(args.status, now, args.id);
      }
      if (args.creditLimit !== undefined) {
        db.prepare('UPDATE CUSTMAST SET CUST_CRDT = ?, CUST_UPDT = ? WHERE CUST_ID = ?')
          .run(args.creditLimit, now, args.id);
      }
      return db.prepare('SELECT * FROM CUSTMAST WHERE CUST_ID = ?').get(args.id);
    },

    updateInventoryQuantity: (_: unknown, args: { id: string; quantity: number }) => {
      const db = getLegacyDb();
      db.prepare('UPDATE INVNTRY SET ITEM_QTY = ? WHERE ITEM_ID = ?').run(args.quantity, args.id);
      return db.prepare('SELECT * FROM INVNTRY WHERE ITEM_ID = ?').get(args.id);
    },

    createOrder: (_: unknown, args: { customerId: string; notes?: string }) => {
      const db = getLegacyDb();
      const id = 'ORD-' + Date.now();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      db.prepare('INSERT INTO ORDERHDR (ORDR_ID, CUST_ID, ORDR_DATE, ORDR_STAT, ORDR_TOTAL, ORDR_NOTES) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, args.customerId, today, 'O', 0.00, args.notes ?? null);
      return db.prepare('SELECT * FROM ORDERHDR WHERE ORDR_ID = ?').get(id);
    },
  },

  // ── Type resolvers (relations) ────────────────────────────────────────────
  OrderHeader: {
    customer: (parent: Record<string, string>) => {
      return getLegacyDb().prepare('SELECT * FROM CUSTMAST WHERE CUST_ID = ?').get(parent['CUST_ID']);
    },
    lineItems: (parent: Record<string, string>) => {
      return getLegacyDb().prepare('SELECT * FROM ORDERDTL WHERE ORDR_ID = ?').all(parent['ORDR_ID']);
    },
  },

  OrderDetail: {
    item: (parent: Record<string, string>) => {
      return getLegacyDb().prepare('SELECT * FROM INVNTRY WHERE ITEM_ID = ?').get(parent['ITEM_ID']);
    },
  },

  // ── Subscriptions ─────────────────────────────────────────────────────────
  Subscription: {
    cdcEvent: {
      subscribe: (_: unknown, args: { table?: string }) => {
        activeSubscriptions++;
        logger.info('[Subscription] New subscriber' + (args.table ? ' watching table: ' + args.table : ' watching all tables'));
        const iterator = pubsub.asyncIterator([CDC_TOPIC]);
        return iterator;
      },
      resolve: (payload: { cdcEvent: CDCEvent }, args: { table?: string }) => {
        activeSubscriptions = Math.max(0, activeSubscriptions);
        if (args.table && payload.cdcEvent.table !== args.table) return null;
        incrementMessages();
        return payload.cdcEvent;
      },
    },
  },
};
