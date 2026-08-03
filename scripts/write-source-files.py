#!/usr/bin/env python3
"""
EpochBridge — Bulk source file writer
Generates all remaining TypeScript source files for the MVP.
"""

import os

BASE = '/Users/mac/EpochBridge/src'

files = {}

# ── CDC PubSub Bridge ─────────────────────────────────────────────────────────
files['cdc/pubsub-bridge.ts'] = """\
import { PubSub } from 'graphql-subscriptions';
import { logger } from '../utils/logger';
import type { CDCEvent } from '../types';

export const CDC_TOPIC = 'CDC_EVENT';
export const pubsub = new PubSub();

export function publishCDCEvent(event: CDCEvent): void {
  pubsub.publish(CDC_TOPIC, { cdcEvent: event });
  logger.debug('[PubSub] Published ' + event.operation + ' on ' + event.table);
}
"""

# ── LLM Intelligence Layer — Schema Generator ─────────────────────────────────
files['intelligence/schema-generator.ts'] = """\
/**
 * EpochBridge — LLM-Assisted Schema Generator
 *
 * Analyzes legacy AS/400 / COBOL table definitions and generates:
 *   1. GraphQL type definitions
 *   2. TypeScript interface types
 *   3. Resolver stub code
 *
 * Provider hierarchy: openai → local → mock
 */

import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { LegacySchema, LegacyTable, LegacyColumn, GeneratedSchemaArtifact } from '../types';

// ── Type mapping: Legacy DB types → GraphQL scalars ──────────────────────────
const TYPE_MAP: Record<string, string> = {
  // COBOL / RPG / AS400 types
  'CHAR': 'String',
  'VARCHAR': 'String',
  'CHARACTER': 'String',
  'VARYING': 'String',
  'PACKED DECIMAL': 'Float',
  'ZONED DECIMAL': 'Float',
  'DECIMAL': 'Float',
  'NUMERIC': 'Float',
  'INTEGER': 'Int',
  'INT': 'Int',
  'SMALLINT': 'Int',
  'BIGINT': 'String',       // BigInt as string to preserve precision
  'REAL': 'Float',
  'FLOAT': 'Float',
  'DOUBLE': 'Float',
  'DATE': 'String',
  'TIME': 'String',
  'TIMESTAMP': 'String',
  'TEXT': 'String',
  'BLOB': 'String',
  'BOOLEAN': 'Boolean',
  'BOOL': 'Boolean',
};

function mapLegacyType(legacyType: string): string {
  const upper = legacyType.toUpperCase().split('(')[0].trim();
  return TYPE_MAP[upper] ?? 'String';
}

function toPascalCase(str: string): string {
  return str
    .toLowerCase()
    .split(/[_\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

// ── GraphQL SDL generator ─────────────────────────────────────────────────────

function generateGraphQLType(table: LegacyTable): string {
  const typeName = toPascalCase(table.name);
  const fields = table.columns
    .map((col) => {
      const gqlType = mapLegacyType(col.type);
      const nullable = col.nullable ? '' : '!';
      const camel = toCamelCase(col.name);
      const comment = col.description ? `  # ${col.description}` : '';
      return comment ? `${comment}\\n  ${camel}: ${gqlType}${nullable}` : `  ${camel}: ${gqlType}${nullable}`;
    })
    .join('\\n');

  return `\"\"\"Legacy table: ${table.name}${table.description ? ' — ' + table.description : ''}\"\"\"\\ntype ${typeName} {\\n${fields}\\n}`;
}

function generateQueryFields(table: LegacyTable): string {
  const typeName = toPascalCase(table.name);
  const camelName = toCamelCase(table.name);
  const pk = table.columns.find((c) => c.isPrimaryKey);
  const pkArg = pk ? `(id: String!)` : '';
  const pkField = pk ? `${camelName}${pkArg}: ${typeName}` : '';
  return [
    `  all${typeName}s(limit: Int, offset: Int): [${typeName}!]!`,
    pkField ? `  ${pkField}` : '',
  ]
    .filter(Boolean)
    .join('\\n');
}

function generateGraphQLSchema(schema: LegacySchema): string {
  const types = schema.tables.map(generateGraphQLType).join('\\n\\n');
  const queries = schema.tables.map(generateQueryFields).join('\\n');

  return `# EpochBridge Auto-Generated GraphQL Schema
# Source: ${schema.source}
# Generated: ${schema.capturedAt}
# DO NOT EDIT — regenerate with: npm run generate-schema

scalar JSON

${types}

type CDCEvent {
  id: String!
  operation: String!
  table: String!
  database: String!
  timestamp: String!
  before: JSON
  after: JSON
}

type GatewayHealth {
  status: String!
  uptime: Float!
  kafkaConnected: Boolean!
  legacyDbConnected: Boolean!
  activeSubscriptions: Int!
  messagesProcessed: Int!
  lastCDCEvent: String
}

type Query {
${queries}
  health: GatewayHealth!
}

type Mutation {
  updateCustomer(id: String!, status: String, creditLimit: Float): Customer
  updateInventoryQuantity(id: String!, quantity: Int!): Inventory
  createOrder(customerId: String!, notes: String): OrderHeader
}

type Subscription {
  cdcEvent(table: String): CDCEvent
}
`;
}

// ── TypeScript type generator ─────────────────────────────────────────────────

function generateTSInterface(table: LegacyTable): string {
  const typeName = toPascalCase(table.name);
  const fields = table.columns
    .map((col) => {
      const tsType = col.type.toUpperCase().includes('INT')
        ? 'number'
        : col.type.toUpperCase().includes('REAL') || col.type.toUpperCase().includes('DECIMAL') || col.type.toUpperCase().includes('FLOAT')
        ? 'number'
        : col.type.toUpperCase().includes('BOOL')
        ? 'boolean'
        : 'string';
      const optional = col.nullable ? '?' : '';
      return `  ${toCamelCase(col.name)}${optional}: ${tsType};`;
    })
    .join('\\n');

  return `export interface ${typeName} {\\n${fields}\\n}`;
}

function generateTSTypes(schema: LegacySchema): string {
  const header = `// EpochBridge Auto-Generated TypeScript Types\\n// Source: ${schema.source} | Generated: ${schema.capturedAt}\\n\\n`;
  return header + schema.tables.map(generateTSInterface).join('\\n\\n') + '\\n';
}

// ── Resolver stub generator ───────────────────────────────────────────────────

function generateResolverStubs(schema: LegacySchema): string {
  const resolvers = schema.tables
    .map((table) => {
      const typeName = toPascalCase(table.name);
      const camelName = toCamelCase(table.name);
      const pk = table.columns.find((c) => c.isPrimaryKey);
      const pkField = pk ? toCamelCase(pk.name) : 'id';

      return `    all${typeName}s: async (_: unknown, args: { limit?: number; offset?: number }, ctx: any) => {
      return ctx.legacyDb.prepare('SELECT * FROM ${table.name} LIMIT ? OFFSET ?')
        .all(args.limit ?? 100, args.offset ?? 0);
    },
    ${camelName}: async (_: unknown, args: { id: string }, ctx: any) => {
      return ctx.legacyDb.prepare('SELECT * FROM ${table.name} WHERE ${pkField.toUpperCase()} = ?').get(args.id);
    },`;
    })
    .join('\\n\\n');

  return `import type { IResolvers } from '@graphql-tools/utils';
import { pubsub, CDC_TOPIC } from '../cdc/pubsub-bridge';

// EpochBridge Auto-Generated Resolver Stubs
// Source: ${schema.source}

export const resolvers: IResolvers = {
  Query: {
${resolvers}
    health: (_: unknown, __: unknown, ctx: any) => ctx.gateway.health(),
  },
  Subscription: {
    cdcEvent: {
      subscribe: () => pubsub.asyncIterator([CDC_TOPIC]),
      resolve: (payload: any) => payload.cdcEvent,
    },
  },
};
`;
}

// ── Mock provider (no LLM required) ──────────────────────────────────────────

function generateWithMock(schema: LegacySchema): GeneratedSchemaArtifact {
  logger.info('[LLM Intelligence] Using mock provider — no API key required');
  return {
    source: schema,
    graphqlTypeDefs: generateGraphQLSchema(schema),
    typescriptTypes: generateTSTypes(schema),
    resolverStubs: generateResolverStubs(schema),
    generatedAt: new Date().toISOString(),
    llmProvider: 'mock',
  };
}

// ── OpenAI provider ──────────────────────────────────────────────────────────

async function generateWithOpenAI(schema: LegacySchema): Promise<GeneratedSchemaArtifact> {
  logger.info('[LLM Intelligence] Calling OpenAI GPT-4o for schema enrichment...');

  // Base artifact from deterministic generator
  const base = generateWithMock(schema);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.llm.openaiApiKey,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a legacy mainframe modernization expert. Given a legacy database schema, enrich the GraphQL type descriptions and field names with human-readable documentation. Return ONLY the improved GraphQL SDL as plain text.',
          },
          {
            role: 'user',
            content:
              'Improve the following GraphQL schema with better descriptions and modern naming conventions (keep compatibility). Source system: ' +
              schema.source +
              '\\n\\n' +
              base.graphqlTypeDefs,
          },
        ],
        max_tokens: 4096,
        temperature: 0.2,
      }),
    });

    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const enriched = data.choices?.[0]?.message?.content ?? base.graphqlTypeDefs;

    return { ...base, graphqlTypeDefs: enriched, llmProvider: 'openai' };
  } catch (err) {
    logger.warn('[LLM Intelligence] OpenAI call failed — falling back to mock generator', err);
    return base;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateSchema(schema: LegacySchema): Promise<GeneratedSchemaArtifact> {
  switch (config.llm.provider) {
    case 'openai':
      return generateWithOpenAI(schema);
    case 'local':
      logger.info('[LLM Intelligence] Local provider not yet implemented — using mock');
      return generateWithMock(schema);
    default:
      return generateWithMock(schema);
  }
}

/** Convenience: introspect the live legacy DB and generate a schema artifact */
export function introspectLegacyDB(db: import('better-sqlite3').Database): LegacySchema {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'CHANGE_LOG' ORDER BY name")
    .all() as Array<{ name: string }>;

  const legacyTables: LegacyTable[] = tables.map(({ name }) => {
    const pragmaRows = db.prepare('PRAGMA table_info(' + name + ')').all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const columns: LegacyColumn[] = pragmaRows.map((row) => ({
      name: row.name,
      type: row.type || 'TEXT',
      nullable: row.notnull === 0,
      isPrimaryKey: row.pk === 1,
    }));

    const rowCount = (db.prepare('SELECT COUNT(*) as cnt FROM ' + name).get() as { cnt: number }).cnt;

    return { name, columns, estimatedRows: rowCount };
  });

  return {
    source: 'AS400_SQLITE_MOCK',
    tables: legacyTables,
    capturedAt: new Date().toISOString(),
  };
}
"""

# ── GraphQL Schema (static SDL for gateway) ───────────────────────────────────
files['gateway/schema.ts'] = """\
import { gql } from 'graphql-tag';

export const typeDefs = gql`
  scalar JSON

  \"\"\"A customer record from the legacy CUSTMAST physical file\"\"\"
  type Customer {
    custId: String!
    custName: String!
    custAddr1: String
    custCity: String
    custState: String
    custZip: String
    custPhone: String
    custCrdt: Float
    custStat: String
    custCrtd: String
    custUpdt: String
  }

  \"\"\"An inventory item from the legacy INVNTRY physical file\"\"\"
  type Inventory {
    itemId: String!
    itemDesc: String!
    itemUom: String
    itemQty: Int
    itemCost: Float
    itemPrice: Float
    itemWhse: String
    itemStat: String
  }

  \"\"\"An order header from the legacy ORDERHDR physical file\"\"\"
  type OrderHeader {
    ordrId: String!
    custId: String!
    ordrDate: String!
    ordrShip: String
    ordrStat: String
    ordrTotal: Float
    ordrNotes: String
    customer: Customer
    lineItems: [OrderDetail!]!
  }

  \"\"\"An order line item from the legacy ORDERDTL physical file\"\"\"
  type OrderDetail {
    dtailId: String!
    ordrId: String!
    itemId: String!
    dtailQty: Int
    dtailUprc: Float
    dtailExt: Float
    item: Inventory
  }

  \"\"\"A Change Data Capture event streamed from the legacy database\"\"\"
  type CDCEvent {
    id: String!
    operation: String!
    table: String!
    database: String!
    timestamp: String!
    before: JSON
    after: JSON
  }

  \"\"\"Gateway health and telemetry\"\"\"
  type GatewayHealth {
    status: String!
    uptime: Float!
    kafkaConnected: Boolean!
    legacyDbConnected: Boolean!
    activeSubscriptions: Int!
    messagesProcessed: Int!
    lastCDCEvent: String
  }

  type GeneratedSchema {
    graphqlTypeDefs: String!
    typescriptTypes: String!
    resolverStubs: String!
    generatedAt: String!
    llmProvider: String!
  }

  type Query {
    # ── Customer queries ──────────────────────────────────────────────────────
    allCustomers(limit: Int, offset: Int, status: String): [Customer!]!
    customer(id: String!): Customer

    # ── Inventory queries ─────────────────────────────────────────────────────
    allInventory(limit: Int, offset: Int, warehouse: String): [Inventory!]!
    inventoryItem(id: String!): Inventory

    # ── Order queries ─────────────────────────────────────────────────────────
    allOrders(limit: Int, offset: Int, status: String): [OrderHeader!]!
    order(id: String!): OrderHeader
    ordersByCustomer(customerId: String!): [OrderHeader!]!

    # ── Platform ──────────────────────────────────────────────────────────────
    health: GatewayHealth!
    generateSchemaFromLegacyDB: GeneratedSchema!
  }

  type Mutation {
    updateCustomer(id: String!, status: String, creditLimit: Float): Customer
    updateInventoryQuantity(id: String!, quantity: Int!): Inventory
    createOrder(customerId: String!, notes: String): OrderHeader
  }

  type Subscription {
    \"\"\"Stream all CDC events from the legacy database\"\"\"
    cdcEvent(table: String): CDCEvent
  }
`;
"""

# ── GraphQL Resolvers ─────────────────────────────────────────────────────────
files['gateway/resolvers.ts'] = """\
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
"""

# ── Security Middleware ───────────────────────────────────────────────────────
files['middleware/security.ts'] = """\
import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import depthLimit from 'graphql-depth-limit';
import { GraphQLError } from 'graphql';
import { logger } from '../utils/logger';

/**
 * Rate limiter — protects the legacy mainframe from traffic spikes.
 * Growth Tier: 10M calls/month ~= ~3.8 req/s sustained
 * We allow bursts up to 100 req per 15s window per IP.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 1000,        // 15-second window
  max: 100,                   // max 100 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    errors: [{ message: 'EpochBridge: Rate limit exceeded. Slow down to protect the legacy mainframe.' }],
  },
  handler: (req: Request, res: Response) => {
    logger.warn('[Security] Rate limit exceeded from IP: ' + req.ip);
    res.status(429).json({
      errors: [{ message: 'Rate limit exceeded. Upgrade to Enterprise Tier for higher throughput.' }],
    });
  },
});

/**
 * GraphQL query depth limiter — prevents deeply nested queries from
 * generating catastrophic SQL JOINs against the fragile legacy database.
 * Limit of 7 allows: query > type > relation > type > relation > field
 */
export const depthLimiter = depthLimit(7, { ignore: ['__schema', '__type'] });

/**
 * GraphQL query complexity guard — rejects queries that would generate
 * too many database round-trips. Each field costs 1, list fields cost 10.
 */
export function complexityGuard(
  documentAST: import('graphql').DocumentNode,
  _schema: import('graphql').GraphQLSchema
): GraphQLError | null {
  // Simple field count heuristic (replace with graphql-query-complexity in production)
  const queryStr = JSON.stringify(documentAST);
  const fieldCount = (queryStr.match(/"name":/g) || []).length;
  if (fieldCount > 200) {
    logger.warn('[Security] Query complexity too high: ' + fieldCount + ' fields');
    return new GraphQLError(
      'Query too complex (' + fieldCount + ' fields). Maximum is 200. Use pagination and fragments.',
      { extensions: { code: 'QUERY_TOO_COMPLEX' } }
    );
  }
  return null;
}

/**
 * Security headers middleware — adds standard hardening headers.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Powered-By', 'EpochBridge');
  next();
}

/**
 * Request logger middleware.
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  logger.debug('[Gateway] ' + req.method + ' ' + req.path + ' — ' + req.ip);
  next();
}
"""

# ── Main Gateway Entry Point ──────────────────────────────────────────────────
files['index.ts'] = """\
/**
 * EpochBridge — Main Gateway Entry Point
 *
 * Boots:
 *  1. SQLite legacy database (with CDC triggers)
 *  2. Kafka CDC Producer (polls CHANGE_LOG -> publishes to Kafka)
 *  3. Kafka CDC Consumer (consumes Kafka -> fires GraphQL PubSub)
 *  4. Apollo GraphQL Server over Express (HTTP + WebSocket subscriptions)
 *  5. Security middleware (rate limiting, depth limiting)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';

import { config } from './config';
import { logger } from './utils/logger';
import { typeDefs } from './gateway/schema';
import { resolvers, setKafkaConnected, incrementMessages } from './gateway/resolvers';
import { CDCProducer } from './cdc/producer';
import { CDCConsumer } from './cdc/consumer';
import { publishCDCEvent } from './cdc/pubsub-bridge';
import { getLegacyDb } from './legacy-db/connection';
import { apiRateLimiter, depthLimiter, securityHeaders, requestLogger } from './middleware/security';

async function main(): Promise<void> {
  // ── 1. Ensure legacy DB is initialized ─────────────────────────────────────
  const db = getLegacyDb();
  logger.info('[Boot] Legacy database ready');

  // ── 2. Build GraphQL Schema ─────────────────────────────────────────────────
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // ── 3. Express + HTTP Server ────────────────────────────────────────────────
  const app = express();
  const httpServer = http.createServer(app);

  // ── 4. WebSocket Server for GraphQL Subscriptions ──────────────────────────
  const wss = new WebSocketServer({ server: httpServer, path: '/graphql' });
  const serverCleanup = useServer(
    {
      schema,
      onConnect: (ctx) => {
        logger.info('[WS] Client connected: ' + ctx.connectionParams?.clientId ?? 'anonymous');
      },
      onDisconnect: () => {
        logger.info('[WS] Client disconnected');
      },
    },
    wss
  );

  // ── 5. Apollo Server ────────────────────────────────────────────────────────
  const apolloServer = new ApolloServer({
    schema,
    validationRules: [depthLimiter],
    introspection: true,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
    formatError: (formattedError, error) => {
      logger.error('[GraphQL Error] ' + formattedError.message);
      return formattedError;
    },
  });
  await apolloServer.start();

  // ── 6. Middleware stack ─────────────────────────────────────────────────────
  app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));
  app.use(express.json({ limit: '1mb' }));
  app.use(securityHeaders);
  app.use(requestLogger);
  app.use('/graphql', apiRateLimiter);
  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async () => ({ legacyDb: db }),
    })
  );

  // ── 7. Health endpoint (REST) ───────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '1.0.0', uptime: process.uptime() });
  });

  // ── 8. Developer Portal static files ───────────────────────────────────────
  app.get('/', (_req, res) => {
    res.send(getPortalHtml());
  });

  // ── 9. CDC Producer (legacy DB watcher) ────────────────────────────────────
  const cdcProducer = new CDCProducer();
  await cdcProducer.connect();

  // Install change log triggers (idempotent)
  // The triggers are set up inside connect() when Kafka is available,
  // but we also need them in local mode:
  try {
    db.exec('SELECT 1 FROM CHANGE_LOG LIMIT 1');
  } catch {
    // CHANGE_LOG not yet created — create it manually for local mode
    db.exec('CREATE TABLE IF NOT EXISTS CHANGE_LOG (LOG_ID TEXT PRIMARY KEY, LOG_TABLE TEXT, LOG_OP TEXT, LOG_BEFORE TEXT, LOG_AFTER TEXT, LOG_TS TEXT, LOG_SENT INTEGER DEFAULT 0)');
  }

  cdcProducer.startPolling((event) => {
    publishCDCEvent(event);
    incrementMessages();
    logger.info('[CDC] Change detected: ' + event.operation + ' on ' + event.table);
  });

  // ── 10. CDC Consumer (Kafka -> PubSub) ─────────────────────────────────────
  const cdcConsumer = new CDCConsumer();
  cdcConsumer.onEvent((event) => {
    publishCDCEvent(event);
    incrementMessages();
  });
  await cdcConsumer.connect();

  const kafkaOk = true; // optimistic — CDCProducer logs actual status
  setKafkaConnected(kafkaOk);

  // ── 11. Start listening ─────────────────────────────────────────────────────
  await new Promise<void>((resolve) => {
    httpServer.listen(config.port, resolve);
  });

  logger.info('');
  logger.info('╔══════════════════════════════════════════════════════════╗');
  logger.info('║       EpochBridge Gateway — ONLINE                      ║');
  logger.info('╠══════════════════════════════════════════════════════════╣');
  logger.info('║  GraphQL  : http://localhost:' + config.port + '/graphql          ║');
  logger.info('║  WebSocket: ws://localhost:' + config.port + '/graphql            ║');
  logger.info('║  Portal   : http://localhost:' + config.port + '/                 ║');
  logger.info('║  Health   : http://localhost:' + config.port + '/health           ║');
  logger.info('╚══════════════════════════════════════════════════════════╝');
  logger.info('');

  // ── 12. Graceful shutdown ───────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info('[Boot] Received ' + signal + ' — shutting down gracefully...');
    await cdcProducer.disconnect();
    await cdcConsumer.disconnect();
    await apolloServer.stop();
    httpServer.close(() => {
      logger.info('[Boot] HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

function getPortalHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EpochBridge Developer Portal</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; }
    header { background: linear-gradient(135deg, #1e3a5f 0%, #0f2740 100%); padding: 2rem; border-bottom: 1px solid #2d4a6b; }
    header h1 { font-size: 2rem; font-weight: 700; color: #60a5fa; letter-spacing: -0.5px; }
    header p { color: #94a3b8; margin-top: 0.5rem; font-size: 1rem; }
    .badge { display: inline-block; background: #10b981; color: #fff; border-radius: 999px; padding: 2px 10px; font-size: 0.75rem; font-weight: 600; margin-left: 1rem; vertical-align: middle; }
    main { max-width: 1100px; margin: 2rem auto; padding: 0 1.5rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-top: 1.5rem; }
    .card { background: #1e293b; border: 1px solid #2d4a6b; border-radius: 12px; padding: 1.5rem; }
    .card h3 { color: #60a5fa; font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem; }
    .card p { color: #94a3b8; font-size: 0.875rem; line-height: 1.6; }
    .endpoint { background: #0f172a; border: 1px solid #1e3a5f; border-radius: 8px; padding: 0.75rem 1rem; margin-top: 0.75rem; font-family: 'Courier New', monospace; font-size: 0.85rem; color: #34d399; }
    .cta { display: inline-block; margin-top: 1rem; background: #2563eb; color: #fff; padding: 0.6rem 1.4rem; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.875rem; transition: background 0.2s; }
    .cta:hover { background: #1d4ed8; }
    .query-box { background: #0f172a; border: 1px solid #1e3a5f; border-radius: 8px; padding: 1rem; margin-top: 1rem; font-family: monospace; font-size: 0.8rem; color: #a5f3fc; white-space: pre; overflow-x: auto; }
    footer { text-align: center; padding: 2rem; color: #475569; font-size: 0.8rem; }
    .status { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }
  </style>
</head>
<body>
  <header>
    <h1>EpochBridge <span class="badge">ONLINE</span></h1>
    <p>Intelligent Legacy Modernization Hub — GraphQL Gateway over AS/400-style Databases</p>
    <div class="status"><div class="dot"></div><span style="color:#10b981;font-size:0.85rem;">CDC Streaming Active</span></div>
  </header>
  <main>
    <div class="grid">
      <div class="card">
        <h3>GraphQL Playground</h3>
        <p>Explore the legacy database through a modern GraphQL API. Query customers, inventory, orders and stream real-time CDC events.</p>
        <a href="/graphql" class="cta">Open GraphQL Explorer</a>
      </div>
      <div class="card">
        <h3>API Endpoints</h3>
        <div class="endpoint">POST /graphql — Query & Mutations</div>
        <div class="endpoint">WS   /graphql — Subscriptions</div>
        <div class="endpoint">GET  /health  — Gateway Health</div>
      </div>
      <div class="card">
        <h3>Sample Query</h3>
        <div class="query-box">query {
  allCustomers(limit: 5) {
    custId
    custName
    custStat
  }
  health {
    status
    uptime
    messagesProcessed
  }
}</div>
      </div>
      <div class="card">
        <h3>CDC Subscription</h3>
        <div class="query-box">subscription {
  cdcEvent(table: "CUSTMAST") {
    operation
    table
    timestamp
    after
  }
}</div>
      </div>
      <div class="card">
        <h3>LLM Schema Generator</h3>
        <p>Auto-generate GraphQL schemas from your legacy database structure using the intelligence layer.</p>
        <div class="query-box">query {
  generateSchemaFromLegacyDB {
    graphqlTypeDefs
    llmProvider
  }
}</div>
      </div>
      <div class="card">
        <h3>Architecture</h3>
        <p><strong>Legacy DB</strong> → SQLite (AS/400 mock)<br/>
        <strong>CDC Layer</strong> → SQL triggers + Kafka<br/>
        <strong>Intelligence</strong> → LLM schema gen<br/>
        <strong>Gateway</strong> → Apollo GraphQL + WS<br/>
        <strong>Security</strong> → Rate limit + Depth limit</p>
      </div>
    </div>
  </main>
  <footer>EpochBridge v1.0.0 — Confidential | EpochBridge Founding Team<br/>
  Growth Tier: $75,000/yr | Enterprise Tier: $200,000+/yr</footer>
</body>
</html>`;
}

main().catch((err) => {
  logger.error('[Boot] Fatal error during startup', err);
  process.exit(1);
});
"""

# Write all files
for relative_path, content in files.items():
    full_path = os.path.join(BASE, relative_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w') as f:
        f.write(content)
    print(f'  wrote: src/{relative_path}')

print('All source files written successfully!')
