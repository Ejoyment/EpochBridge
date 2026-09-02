import { v4 as uuidv4 } from 'uuid';
import { GraphQLError } from 'graphql';
import { pubsub, CDC_TOPIC } from '../cdc/pubsub-bridge';
import { getLegacyDb, hashPassword } from '../legacy-db/connection';
import { introspectLegacyDB, generateSchema } from '../intelligence/schema-generator';
import { signToken } from '../auth/jwt';
import { requireAuth } from '../auth/permissions';
import { logger } from '../utils/logger';
import type { CDCEvent } from '../types';
import type { AuthContext } from '../auth/context';

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
    allCustomers: (_: unknown, args: { limit?: number; offset?: number; status?: string }, ctx: { auth?: AuthContext }) => {
      requireAuth(ctx);
      const db = getLegacyDb();
      if (args.status) {
        return db.prepare('SELECT * FROM CUSTMAST WHERE CUST_STAT = ? LIMIT ? OFFSET ?')
          .all(args.status, args.limit ?? 100, args.offset ?? 0);
      }
      return db.prepare('SELECT * FROM CUSTMAST LIMIT ? OFFSET ?')
        .all(args.limit ?? 100, args.offset ?? 0);
    },

    customer: (_: unknown, args: { id: string }, ctx: { auth?: AuthContext }) => {
      requireAuth(ctx);
      return getLegacyDb().prepare('SELECT * FROM CUSTMAST WHERE CUST_ID = ?').get(args.id);
    },

    // ── Inventory ──────────────────────────────────────────────────────────
    allInventory: (_: unknown, args: { limit?: number; offset?: number; warehouse?: string }, ctx: { auth?: AuthContext }) => {
      requireAuth(ctx);
      const db = getLegacyDb();
      if (args.warehouse) {
        return db.prepare('SELECT * FROM INVNTRY WHERE ITEM_WHSE = ? LIMIT ? OFFSET ?')
          .all(args.warehouse, args.limit ?? 100, args.offset ?? 0);
      }
      return db.prepare('SELECT * FROM INVNTRY LIMIT ? OFFSET ?')
        .all(args.limit ?? 100, args.offset ?? 0);
    },

    inventoryItem: (_: unknown, args: { id: string }, ctx: { auth?: AuthContext }) => {
      requireAuth(ctx);
      return getLegacyDb().prepare('SELECT * FROM INVNTRY WHERE ITEM_ID = ?').get(args.id);
    },

    // ── Orders ─────────────────────────────────────────────────────────────
    allOrders: (_: unknown, args: { limit?: number; offset?: number; status?: string }, ctx: { auth?: AuthContext }) => {
      requireAuth(ctx);
      const db = getLegacyDb();
      if (args.status) {
        return db.prepare('SELECT * FROM ORDERHDR WHERE ORDR_STAT = ? LIMIT ? OFFSET ?')
          .all(args.status, args.limit ?? 100, args.offset ?? 0);
      }
      return db.prepare('SELECT * FROM ORDERHDR LIMIT ? OFFSET ?')
        .all(args.limit ?? 100, args.offset ?? 0);
    },

    order: (_: unknown, args: { id: string }, ctx: { auth?: AuthContext }) => {
      requireAuth(ctx);
      return getLegacyDb().prepare('SELECT * FROM ORDERHDR WHERE ORDR_ID = ?').get(args.id);
    },

    ordersByCustomer: (_: unknown, args: { customerId: string }, ctx: { auth?: AuthContext }) => {
      requireAuth(ctx);
      return getLegacyDb()
        .prepare('SELECT * FROM ORDERHDR WHERE CUST_ID = ? ORDER BY ORDR_DATE DESC')
        .all(args.customerId);
    },

    // ── Platform ───────────────────────────────────────────────────────────
    health: (_: unknown, __: unknown, ctx: { auth?: AuthContext }) => {
      requireAuth(ctx);
      return {
        status: 'healthy',
        uptime: (Date.now() - startTime) / 1000,
        kafkaConnected,
        legacyDbConnected: true,
        activeSubscriptions,
        messagesProcessed,
        lastCDCEvent,
      };
    },

    generateSchemaFromLegacyDB: async (_: unknown, __: unknown, ctx: { auth?: AuthContext }) => {
      requireAuth(ctx);
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

    // ── Auth ───────────────────────────────────────────────────────────────
    me: (_: unknown, __: unknown, ctx: { auth?: AuthContext }) => {
      const user = ctx.auth?.user;
      if (!user) return null;
      return { id: user.id, username: user.username, role: user.role };
    },
  },

  // ── Mutations ────────────────────────────────────────────────────────────
  Mutation: {
    updateCustomer: (_: unknown, args: { id: string; status?: string; creditLimit?: number }, ctx: { auth?: AuthContext }) => {
      requireAuth(ctx);
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

    updateInventoryQuantity: (_: unknown, args: { id: string; quantity: number }, ctx: { auth?: AuthContext }) => {
      requireAuth(ctx);
      const db = getLegacyDb();
      db.prepare('UPDATE INVNTRY SET ITEM_QTY = ? WHERE ITEM_ID = ?').run(args.quantity, args.id);
      return db.prepare('SELECT * FROM INVNTRY WHERE ITEM_ID = ?').get(args.id);
    },

    createOrder: (_: unknown, args: { customerId: string; notes?: string }, ctx: { auth?: AuthContext }) => {
      requireAuth(ctx);
      const db = getLegacyDb();
      const id = 'ORD-' + Date.now();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      db.prepare('INSERT INTO ORDERHDR (ORDR_ID, CUST_ID, ORDR_DATE, ORDR_STAT, ORDR_TOTAL, ORDR_NOTES) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, args.customerId, today, 'O', 0.00, args.notes ?? null);
      return db.prepare('SELECT * FROM ORDERHDR WHERE ORDR_ID = ?').get(id);
    },

    // ── Auth ───────────────────────────────────────────────────────────────
    register: (_: unknown, args: { username: string; password: string }) => {
      const db = getLegacyDb();

      const existing = db.prepare('SELECT ID FROM USERS WHERE USERNAME = ?').get(args.username);
      if (existing) {
        throw new GraphQLError('Username already taken', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const id = 'usr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const now = new Date().toISOString();
      const passwordHash = hashPassword(args.password);

      db.prepare('INSERT INTO USERS (ID, USERNAME, PASSWORD_HASH, ROLE, CREATED_AT) VALUES (?, ?, ?, ?, ?)')
        .run(id, args.username, passwordHash, 'user', now);

      const token = signToken({ id, username: args.username, role: 'user' });
      return { token, user: { id, username: args.username, role: 'user' } };
    },

    login: (_: unknown, args: { username: string; password: string }) => {
      const db = getLegacyDb();
      const user = db.prepare('SELECT * FROM USERS WHERE USERNAME = ?').get(args.username) as {
        ID: string;
        USERNAME: string;
        PASSWORD_HASH: string;
        ROLE: string;
      } | undefined;

      if (!user) {
        throw new GraphQLError('Invalid username or password', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      const passwordHash = hashPassword(args.password);
      if (passwordHash !== user.PASSWORD_HASH) {
        throw new GraphQLError('Invalid username or password', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      const token = signToken({ id: user.ID, username: user.USERNAME, role: user.ROLE });
      return { token, user: { id: user.ID, username: user.USERNAME, role: user.ROLE } };
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
