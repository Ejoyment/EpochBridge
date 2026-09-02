import Database from 'better-sqlite3';
import { getTestDb, closeTestDb } from './helpers/db';
import {
  introspectLegacyDB,
  generateSchema,
} from '../intelligence/schema-generator';
import type { LegacySchema } from '../types';

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

describe('introspectLegacyDB', () => {
  let schema: LegacySchema;

  beforeAll(() => {
    schema = introspectLegacyDB(db);
  });

  it('discovers all 4 legacy tables', () => {
    expect(schema.tables).toHaveLength(4);
  });

  it('returns correct table names', () => {
    const names = schema.tables.map((t) => t.name).sort();
    expect(names).toEqual(['CUSTMAST', 'INVNTRY', 'ORDERDTL', 'ORDERHDR']);
  });

  it('identifies primary keys correctly', () => {
    const custmast = schema.tables.find((t) => t.name === 'CUSTMAST')!;
    const pk = custmast.columns.find((c) => c.isPrimaryKey);
    expect(pk).toBeDefined();
    expect(pk!.name).toBe('CUST_ID');
  });

  it('detects column types', () => {
    const invntry = schema.tables.find((t) => t.name === 'INVNTRY')!;
    const qtyCol = invntry.columns.find((c) => c.name === 'ITEM_QTY');
    expect(qtyCol).toBeDefined();
    expect(qtyCol!.type).toBe('INTEGER');
  });

  it('detects nullable columns', () => {
    const orderhdr = schema.tables.find((t) => t.name === 'ORDERHDR')!;
    const shipCol = orderhdr.columns.find((c) => c.name === 'ORDR_SHIP');
    expect(shipCol).toBeDefined();
    expect(shipCol!.nullable).toBe(true);
  });

  it('detects NOT NULL columns', () => {
    const custmast = schema.tables.find((t) => t.name === 'CUSTMAST')!;
    const nameCol = custmast.columns.find((c) => c.name === 'CUST_NAME');
    expect(nameCol).toBeDefined();
    expect(nameCol!.nullable).toBe(false);
  });

  it('includes estimated row counts', () => {
    for (const table of schema.tables) {
      expect(table.estimatedRows).toBeDefined();
      expect(table.estimatedRows!).toBeGreaterThanOrEqual(0);
    }
  });

  it('sets source identifier', () => {
    expect(schema.source).toBe('AS400_SQLITE_MOCK');
  });

  it('sets capturedAt timestamp', () => {
    expect(schema.capturedAt).toBeTruthy();
    expect(new Date(schema.capturedAt).getTime()).not.toBeNaN();
  });

  it('excludes CHANGE_LOG table', () => {
    db.exec(`CREATE TABLE IF NOT EXISTS CHANGE_LOG (LOG_ID TEXT PRIMARY KEY)`);
    const refreshedSchema = introspectLegacyDB(db);
    expect(refreshedSchema.tables.find((t) => t.name === 'CHANGE_LOG')).toBeUndefined();
  });

  it('returns correct column count for CUSTMAST', () => {
    const custmast = schema.tables.find((t) => t.name === 'CUSTMAST')!;
    expect(custmast.columns).toHaveLength(11);
  });
});

describe('generateSchema (mock provider)', () => {
  let schema: LegacySchema;
  let artifact: Awaited<ReturnType<typeof generateSchema>>;

  beforeAll(async () => {
    schema = introspectLegacyDB(db);
    artifact = await generateSchema(schema);
  });

  it('returns graphqlTypeDefs as string', () => {
    expect(typeof artifact.graphqlTypeDefs).toBe('string');
    expect(artifact.graphqlTypeDefs.length).toBeGreaterThan(0);
  });

  it('returns typescriptTypes as string', () => {
    expect(typeof artifact.typescriptTypes).toBe('string');
    expect(artifact.typescriptTypes.length).toBeGreaterThan(0);
  });

  it('returns resolverStubs as string', () => {
    expect(typeof artifact.resolverStubs).toBe('string');
    expect(artifact.resolverStubs.length).toBeGreaterThan(0);
  });

  it('sets llmProvider to mock', () => {
    expect(artifact.llmProvider).toBe('mock');
  });

  it('sets generatedAt timestamp', () => {
    expect(artifact.generatedAt).toBeTruthy();
    expect(new Date(artifact.generatedAt).getTime()).not.toBeNaN();
  });

  it('generates valid GraphQL SDL with type definitions', () => {
    expect(artifact.graphqlTypeDefs).toContain('type Custmast');
    expect(artifact.graphqlTypeDefs).toContain('type Invntry');
    expect(artifact.graphqlTypeDefs).toContain('type Orderhdr');
  });

  it('generates query fields for each table', () => {
    expect(artifact.graphqlTypeDefs).toContain('allCustmasts');
    expect(artifact.graphqlTypeDefs).toContain('allInvntrys');
    expect(artifact.graphqlTypeDefs).toContain('allOrderhdrs');
  });

  it('generates TypeScript interfaces', () => {
    expect(artifact.typescriptTypes).toContain('export interface Custmast');
    expect(artifact.typescriptTypes).toContain('export interface Invntry');
    expect(artifact.typescriptTypes).toContain('export interface Orderhdr');
  });

  it('generates resolver stubs with Query fields', () => {
    expect(artifact.resolverStubs).toContain('Query');
    expect(artifact.resolverStubs).toContain('allCustmasts');
    expect(artifact.resolverStubs).toContain('SELECT * FROM');
  });

  it('includes CDCEvent type in generated SDL', () => {
    expect(artifact.graphqlTypeDefs).toContain('type CDCEvent');
  });

  it('includes GatewayHealth type in generated SDL', () => {
    expect(artifact.graphqlTypeDefs).toContain('type GatewayHealth');
  });

  it('includes Subscription type in generated SDL', () => {
    expect(artifact.graphqlTypeDefs).toContain('type Subscription');
  });

  it('generates nullable fields with ? in TypeScript', () => {
    expect(artifact.typescriptTypes).toContain('custAddr1?:');
  });

  it('generates required fields without ? in TypeScript', () => {
    expect(artifact.typescriptTypes).toMatch(/custId: string/);
  });
});
