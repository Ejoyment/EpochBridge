import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  clearMocks: true,
  collectCoverageFrom: [
    'src/gateway/resolvers.ts',
    'src/gateway/schema.ts',
    'src/cdc/producer.ts',
    'src/cdc/consumer.ts',
    'src/cdc/pubsub-bridge.ts',
    'src/intelligence/schema-generator.ts',
    'src/middleware/security.ts',
    'src/legacy-db/connection.ts',
    'src/auth/**/*.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary'],
  testTimeout: 10000,
};

export default config;
