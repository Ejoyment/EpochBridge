// ─── CDC Event Types ──────────────────────────────────────────────────────────

export type CDCOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export interface CDCEvent {
  id: string;
  operation: CDCOperation;
  table: string;
  database: string;
  timestamp: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata?: {
    transactionId?: string;
    logPosition?: string;
    serverId?: string;
  };
}

// ─── Legacy Schema Types ───────────────────────────────────────────────────────

export interface LegacyColumn {
  name: string;
  type: string;         // Raw legacy type e.g. CHAR(10), PACKED DECIMAL
  nullable: boolean;
  isPrimaryKey: boolean;
  description?: string;
}

export interface LegacyTable {
  name: string;
  schema?: string;
  columns: LegacyColumn[];
  description?: string;
  estimatedRows?: number;
}

export interface LegacySchema {
  source: string;       // e.g. "AS400", "DB2", "COBOL-FLAT-FILE"
  tables: LegacyTable[];
  capturedAt: string;
}

// ─── Generated GraphQL Schema Artifact ────────────────────────────────────────

export interface GeneratedSchemaArtifact {
  source: LegacySchema;
  graphqlTypeDefs: string;
  typescriptTypes: string;
  resolverStubs: string;
  generatedAt: string;
  llmProvider: string;
}

// ─── Gateway Types ────────────────────────────────────────────────────────────

export interface ConnectionConfig {
  id: string;
  name: string;
  type: 'sqlite' | 'postgres' | 'db2' | 'mssql' | 'as400';
  connectionString: string;
  enabled: boolean;
}

export interface GatewayHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  kafkaConnected: boolean;
  legacyDbConnected: boolean;
  activeSubscriptions: number;
  messagesProcessed: number;
  lastCDCEvent?: string;
}

// ─── Auth Types ───────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
  createdAt: string;
}

export interface AuthPayload {
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
  };
}
