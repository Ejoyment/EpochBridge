import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'epochbridge-gateway',
    groupId: process.env.KAFKA_GROUP_ID || 'epochbridge-cdc-group',
    cdcTopic: process.env.KAFKA_CDC_TOPIC || 'legacy.cdc.changes',
  },

  legacyDb: {
    path: process.env.LEGACY_DB_PATH || './data/legacy.db',
  },

  llm: {
    provider: (process.env.LLM_PROVIDER || 'mock') as 'openai' | 'local' | 'mock',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'epochbridge-dev-secret-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  dataDir: path.resolve(__dirname, '../../data'),
};
