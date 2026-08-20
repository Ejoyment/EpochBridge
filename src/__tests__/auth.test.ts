import { getTestDb, closeTestDb } from './helpers/db';
import { resolvers } from '../gateway/resolvers';
import { signToken, verifyToken } from '../auth/jwt';
import { buildAuthContext, buildWSAuthContext } from '../auth/context';
import { requireAuth } from '../auth/permissions';
import * as connectionModule from '../legacy-db/connection';
import { GraphQLError } from 'graphql';

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

jest.mock('../cdc/pubsub-bridge', () => ({
  pubsub: {
    publish: jest.fn(),
    asyncIterator: jest.fn(),
  },
  CDC_TOPIC: 'CDC_EVENT',
}));

jest.mock('../intelligence/schema-generator', () => ({
  introspectLegacyDB: jest.fn(),
  generateSchema: jest.fn(),
}));

let testDb: ReturnType<typeof getTestDb>;
const M = resolvers.Mutation;
const Q = resolvers.Query;

beforeAll(() => {
  testDb = getTestDb();
  (connectionModule.getLegacyDb as jest.Mock).mockReturnValue(testDb);
});

afterAll(() => {
  closeTestDb();
  jest.restoreAllMocks();
});

describe('JWT signToken / verifyToken', () => {
  it('signs and verifies a valid token', () => {
    const token = signToken({ id: 'u1', username: 'testuser', role: 'user' });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const user = verifyToken(token);
    expect(user).toBeTruthy();
    expect(user!.id).toBe('u1');
    expect(user!.username).toBe('testuser');
    expect(user!.role).toBe('user');
  });

  it('returns null for invalid token', () => {
    const user = verifyToken('invalid.token.here');
    expect(user).toBeNull();
  });

  it('returns null for tampered token', () => {
    const token = signToken({ id: 'u1', username: 'testuser', role: 'user' });
    const tampered = token.slice(0, -5) + 'XXXXX';
    const user = verifyToken(tampered);
    expect(user).toBeNull();
  });
});

describe('buildAuthContext', () => {
  it('extracts user from valid Authorization header', () => {
    const token = signToken({ id: 'u1', username: 'testuser', role: 'user' });
    const req = { headers: { authorization: `Bearer ${token}` } } as any;
    const ctx = buildAuthContext(req);
    expect(ctx.user).toBeTruthy();
    expect(ctx.user!.username).toBe('testuser');
  });

  it('returns null user when no Authorization header', () => {
    const req = { headers: {} } as any;
    const ctx = buildAuthContext(req);
    expect(ctx.user).toBeNull();
  });

  it('returns null user for malformed Authorization header', () => {
    const req = { headers: { authorization: 'Basic abc123' } } as any;
    const ctx = buildAuthContext(req);
    expect(ctx.user).toBeNull();
  });
});

describe('buildWSAuthContext', () => {
  it('extracts user from connectionParams token', () => {
    const token = signToken({ id: 'u1', username: 'testuser', role: 'user' });
    const ctx = buildWSAuthContext({ token });
    expect(ctx.user).toBeTruthy();
    expect(ctx.user!.username).toBe('testuser');
  });

  it('returns null user when no token in connectionParams', () => {
    const ctx = buildWSAuthContext({ clientId: 'abc' });
    expect(ctx.user).toBeNull();
  });

  it('returns null user when connectionParams is undefined', () => {
    const ctx = buildWSAuthContext(undefined);
    expect(ctx.user).toBeNull();
  });
});

describe('requireAuth', () => {
  it('returns user when authenticated', () => {
    const user = { id: 'u1', username: 'testuser', role: 'user' };
    const result = requireAuth({ auth: { user } });
    expect(result.id).toBe('u1');
  });

  it('throws UNAUTHENTICATED when no auth context', () => {
    expect(() => requireAuth({})).toThrow(GraphQLError);
    expect(() => requireAuth({})).toThrow('Authentication required');
  });

  it('throws UNAUTHENTICATED when user is null', () => {
    expect(() => requireAuth({ auth: { user: null } })).toThrow(GraphQLError);
  });
});

describe('Mutation.register', () => {
  it('creates a new user and returns token', () => {
    const result = (M as any).register({}, { username: 'newuser', password: 'pass123' });
    expect(result.token).toBeTruthy();
    expect(result.user.username).toBe('newuser');
    expect(result.user.role).toBe('user');
    expect(result.user.id).toMatch(/^usr-/);
  });

  it('rejects duplicate username', () => {
    expect(() => (M as any).register({}, { username: 'admin', password: 'pass123' })).toThrow(GraphQLError);
    expect(() => (M as any).register({}, { username: 'admin', password: 'pass123' })).toThrow('Username already taken');
  });
});

describe('Mutation.login', () => {
  it('returns token for valid credentials', () => {
    const result = (M as any).login({}, { username: 'admin', password: 'admin123' });
    expect(result.token).toBeTruthy();
    expect(result.user.username).toBe('admin');
    expect(result.user.role).toBe('admin');
  });

  it('rejects invalid username', () => {
    expect(() => (M as any).login({}, { username: 'nonexistent', password: 'pass' })).toThrow(GraphQLError);
    expect(() => (M as any).login({}, { username: 'nonexistent', password: 'pass' })).toThrow('Invalid username or password');
  });

  it('rejects invalid password', () => {
    expect(() => (M as any).login({}, { username: 'admin', password: 'wrongpass' })).toThrow(GraphQLError);
  });
});

describe('Query.me', () => {
  it('returns current user when authenticated', () => {
    const token = signToken({ id: 'u1', username: 'testuser', role: 'user' });
    const user = verifyToken(token)!;
    const ctx = { auth: { user } };
    const result = (Q as any).me({}, {}, ctx);
    expect(result.id).toBe('u1');
    expect(result.username).toBe('testuser');
  });

  it('returns null when not authenticated', () => {
    const result = (Q as any).me({}, {}, {});
    expect(result).toBeNull();
  });
});

describe('Protected queries reject unauthenticated access', () => {
  const emptyCtx = {};

  it('allCustomers requires auth', () => {
    expect(() => (Q as any).allCustomers({}, {}, emptyCtx)).toThrow('Authentication required');
  });

  it('customer requires auth', () => {
    expect(() => (Q as any).customer({}, { id: 'C0001' }, emptyCtx)).toThrow('Authentication required');
  });

  it('allInventory requires auth', () => {
    expect(() => (Q as any).allInventory({}, {}, emptyCtx)).toThrow('Authentication required');
  });

  it('allOrders requires auth', () => {
    expect(() => (Q as any).allOrders({}, {}, emptyCtx)).toThrow('Authentication required');
  });

  it('health requires auth', () => {
    expect(() => (Q as any).health({}, {}, emptyCtx)).toThrow('Authentication required');
  });

  it('updateCustomer requires auth', () => {
    expect(() => (M as any).updateCustomer({}, { id: 'C0001', status: 'A' }, emptyCtx)).toThrow('Authentication required');
  });

  it('createOrder requires auth', () => {
    expect(() => (M as any).createOrder({}, { customerId: 'C0001' }, emptyCtx)).toThrow('Authentication required');
  });
});

describe('Protected queries work with valid auth', () => {
  const authCtx = { auth: { user: { id: 'u1', username: 'test', role: 'user' } } };

  it('allCustomers works with auth', () => {
    const result = (Q as any).allCustomers({}, {}, authCtx);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('customer works with auth', () => {
    const result = (Q as any).customer({}, { id: 'C0001' }, authCtx);
    expect(result).toBeTruthy();
    expect(result.CUST_ID).toBe('C0001');
  });

  it('health works with auth', () => {
    const result = (Q as any).health({}, {}, authCtx);
    expect(result.status).toBe('healthy');
  });
});
