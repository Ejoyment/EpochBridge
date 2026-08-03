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
      return comment ? `${comment}\n  ${camel}: ${gqlType}${nullable}` : `  ${camel}: ${gqlType}${nullable}`;
    })
    .join('\n');

  return `"""Legacy table: ${table.name}${table.description ? ' — ' + table.description : ''}"""\ntype ${typeName} {\n${fields}\n}`;
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
    .join('\n');
}

function generateGraphQLSchema(schema: LegacySchema): string {
  const types = schema.tables.map(generateGraphQLType).join('\n\n');
  const queries = schema.tables.map(generateQueryFields).join('\n');

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
    .join('\n');

  return `export interface ${typeName} {\n${fields}\n}`;
}

function generateTSTypes(schema: LegacySchema): string {
  const header = `// EpochBridge Auto-Generated TypeScript Types\n// Source: ${schema.source} | Generated: ${schema.capturedAt}\n\n`;
  return header + schema.tables.map(generateTSInterface).join('\n\n') + '\n';
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
    .join('\n\n');

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
              '\n\n' +
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
