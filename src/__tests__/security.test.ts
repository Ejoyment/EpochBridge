import { GraphQLSchema, parse, validate } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from '../gateway/schema';
import { resolvers } from '../gateway/resolvers';
import { depthLimiter, complexityGuard, securityHeaders } from '../middleware/security';
import { getTestDb, closeTestDb } from './helpers/db';
import * as connectionModule from '../legacy-db/connection';
import type { Request, Response, NextFunction } from 'express';

jest.mock('../legacy-db/connection', () => {
  const actual = jest.requireActual('../legacy-db/connection');
  return {
    ...actual,
    getLegacyDb: jest.fn(),
  };
});

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

let schema: GraphQLSchema;

beforeAll(() => {
  const testDb = getTestDb();
  (connectionModule.getLegacyDb as jest.Mock).mockReturnValue(testDb);
  schema = makeExecutableSchema({ typeDefs, resolvers });
});

afterAll(() => {
  closeTestDb();
});

describe('depthLimiter', () => {
  it('allows valid queries within depth limit', () => {
    const doc = parse(`{ allCustomers { custId custName } }`);
    const errors = validate(schema, doc, [depthLimiter]);
    expect(errors).toHaveLength(0);
  });

  it('allows nested queries within depth limit', () => {
    const doc = parse(`{
      allOrders {
        ordrId
        customer {
          custId
          custName
        }
        lineItems {
          item {
            itemId
            itemDesc
          }
        }
      }
    }`);
    const errors = validate(schema, doc, [depthLimiter]);
    expect(errors).toHaveLength(0);
  });

  it('is exported as a function', () => {
    expect(typeof depthLimiter).toBe('function');
  });
});

describe('complexityGuard', () => {
  it('allows simple queries', () => {
    const doc = parse(`{ allCustomers { custId custName } }`);
    const error = complexityGuard(doc, schema);
    expect(error).toBeNull();
  });

  it('is exported as a function', () => {
    expect(typeof complexityGuard).toBe('function');
  });
});

describe('securityHeaders', () => {
  it('sets all security headers on response', () => {
    const req = {} as Request;
    const res = {
      setHeader: jest.fn(),
    } as unknown as Response;
    const next = jest.fn() as NextFunction;

    securityHeaders(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
    expect(res.setHeader).toHaveBeenCalledWith('X-Powered-By', 'EpochBridge');
    expect(next).toHaveBeenCalled();
  });

  it('calls next() to pass control to next middleware', () => {
    const req = {} as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    securityHeaders(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
