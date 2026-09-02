import { getTestDb, closeTestDb } from './helpers/db';
import { resolvers } from '../gateway/resolvers';
import * as connectionModule from '../legacy-db/connection';

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
const Q = resolvers.Query;
const M = resolvers.Mutation;

beforeAll(() => {
  testDb = getTestDb();
  (connectionModule.getLegacyDb as jest.Mock).mockReturnValue(testDb);
});

afterAll(() => {
  closeTestDb();
  jest.restoreAllMocks();
});

describe('Query.allCustomers', () => {
  it('returns all customers by default', () => {
    const result = (Q as any).allCustomers({}, { limit: undefined, offset: undefined, status: undefined });
    expect(result).toHaveLength(5);
  });

  it('filters by status', () => {
    const result = (Q as any).allCustomers({}, { status: 'I' });
    expect(result).toHaveLength(1);
    expect(result[0].CUST_ID).toBe('C0005');
  });

  it('respects limit', () => {
    const result = (Q as any).allCustomers({}, { limit: 2 });
    expect(result).toHaveLength(2);
  });

  it('respects offset', () => {
    const result = (Q as any).allCustomers({}, { offset: 3 });
    expect(result).toHaveLength(2);
  });

  it('returns empty array when status filter matches nothing', () => {
    const result = (Q as any).allCustomers({}, { status: 'X' });
    expect(result).toHaveLength(0);
  });
});

describe('Query.customer', () => {
  it('returns customer by ID', () => {
    const result = (Q as any).customer({}, { id: 'C0001' });
    expect(result).toBeTruthy();
    expect(result.CUST_ID).toBe('C0001');
    expect(result.CUST_NAME).toBe('ACME MANUFACTURING INC');
  });

  it('returns undefined for non-existent ID', () => {
    const result = (Q as any).customer({}, { id: 'C9999' });
    expect(result).toBeUndefined();
  });
});

describe('Query.allInventory', () => {
  it('returns all inventory items', () => {
    const result = (Q as any).allInventory({}, {});
    expect(result).toHaveLength(8);
  });

  it('filters by warehouse', () => {
    const result = (Q as any).allInventory({}, { warehouse: 'WHSE2' });
    expect(result).toHaveLength(2);
    expect(result.map((i: any) => i.ITEM_ID)).toEqual(['ITM-004', 'ITM-006']);
  });

  it('respects limit', () => {
    const result = (Q as any).allInventory({}, { limit: 3 });
    expect(result).toHaveLength(3);
  });

  it('respects offset', () => {
    const result = (Q as any).allInventory({}, { offset: 6 });
    expect(result).toHaveLength(2);
  });
});

describe('Query.inventoryItem', () => {
  it('returns item by ID', () => {
    const result = (Q as any).inventoryItem({}, { id: 'ITM-001' });
    expect(result).toBeTruthy();
    expect(result.ITEM_ID).toBe('ITM-001');
    expect(result.ITEM_QTY).toBe(2400);
  });

  it('returns undefined for non-existent ID', () => {
    const result = (Q as any).inventoryItem({}, { id: 'ITM-999' });
    expect(result).toBeUndefined();
  });
});

describe('Query.allOrders', () => {
  it('returns all orders', () => {
    const result = (Q as any).allOrders({}, {});
    expect(result).toHaveLength(4);
  });

  it('filters by status', () => {
    const result = (Q as any).allOrders({}, { status: 'C' });
    expect(result).toHaveLength(2);
    expect(result.map((o: any) => o.ORDR_ID)).toEqual(['ORD-20240001', 'ORD-20240002']);
  });

  it('respects limit', () => {
    const result = (Q as any).allOrders({}, { limit: 1 });
    expect(result).toHaveLength(1);
  });

  it('respects offset', () => {
    const result = (Q as any).allOrders({}, { offset: 2 });
    expect(result).toHaveLength(2);
  });
});

describe('Query.order', () => {
  it('returns order by ID', () => {
    const result = (Q as any).order({}, { id: 'ORD-20240001' });
    expect(result).toBeTruthy();
    expect(result.ORDR_ID).toBe('ORD-20240001');
    expect(result.ORDR_TOTAL).toBe(8580);
  });

  it('returns undefined for non-existent ID', () => {
    const result = (Q as any).order({}, { id: 'ORD-999' });
    expect(result).toBeUndefined();
  });
});

describe('Query.ordersByCustomer', () => {
  it('returns orders for a customer', () => {
    const result = (Q as any).ordersByCustomer({}, { customerId: 'C0001' });
    expect(result).toHaveLength(1);
    expect(result[0].ORDR_ID).toBe('ORD-20240001');
  });

  it('returns empty array for customer with no orders', () => {
    const result = (Q as any).ordersByCustomer({}, { customerId: 'C0005' });
    expect(result).toHaveLength(0);
  });
});

describe('Query.health', () => {
  it('returns health status with all fields', () => {
    const result = (Q as any).health({}, {}, {});
    expect(result.status).toBe('healthy');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(typeof result.kafkaConnected).toBe('boolean');
    expect(result.legacyDbConnected).toBe(true);
    expect(result.messagesProcessed).toBeGreaterThanOrEqual(0);
  });
});

describe('Mutation.updateCustomer', () => {
  it('updates customer status', () => {
    const result = (M as any).updateCustomer({}, { id: 'C0005', status: 'A' });
    expect(result.CUST_ID).toBe('C0005');
    expect(result.CUST_STAT).toBe('A');
  });

  it('updates customer credit limit', () => {
    const result = (M as any).updateCustomer({}, { id: 'C0001', creditLimit: 1000000 });
    expect(result.CUST_CRDT).toBe(1000000);
  });

  it('updates both status and credit limit', () => {
    const result = (M as any).updateCustomer({}, { id: 'C0002', status: 'S', creditLimit: 500000 });
    expect(result.CUST_STAT).toBe('S');
    expect(result.CUST_CRDT).toBe(500000);
  });
});

describe('Mutation.updateInventoryQuantity', () => {
  it('updates inventory quantity', () => {
    const result = (M as any).updateInventoryQuantity({}, { id: 'ITM-001', quantity: 1000 });
    expect(result.ITEM_ID).toBe('ITM-001');
    expect(result.ITEM_QTY).toBe(1000);
  });
});

describe('Mutation.createOrder', () => {
  it('creates order with correct defaults', () => {
    const result = (M as any).createOrder({}, { customerId: 'C0001', notes: 'TEST ORDER' });
    expect(result.CUST_ID).toBe('C0001');
    expect(result.ORDR_STAT).toBe('O');
    expect(result.ORDR_TOTAL).toBe(0);
    expect(result.ORDR_NOTES).toBe('TEST ORDER');
    expect(result.ORDR_ID).toMatch(/^ORD-/);
  });

  it('creates order without notes', () => {
    const result = (M as any).createOrder({}, { customerId: 'C0003' });
    expect(result.ORDR_NOTES).toBeNull();
  });
});

describe('Type resolvers (relations)', () => {
  const OrderHeaderResolvers = (resolvers as any).OrderHeader;
  const OrderDetailResolvers = (resolvers as any).OrderDetail;

  it('OrderHeader.customer resolves to the correct customer', () => {
    const parent = { CUST_ID: 'C0001' };
    const result = OrderHeaderResolvers.customer(parent);
    expect(result.CUST_ID).toBe('C0001');
    expect(result.CUST_NAME).toBe('ACME MANUFACTURING INC');
  });

  it('OrderHeader.lineItems resolves to line items', () => {
    const parent = { ORDR_ID: 'ORD-20240001' };
    const result = OrderHeaderResolvers.lineItems(parent);
    expect(result).toHaveLength(2);
    expect(result.map((l: any) => l.ITEM_ID)).toEqual(['ITM-001', 'ITM-005']);
  });

  it('OrderDetail.item resolves to the inventory item', () => {
    const parent = { ITEM_ID: 'ITM-001' };
    const result = OrderDetailResolvers.item(parent);
    expect(result.ITEM_ID).toBe('ITM-001');
    expect(result.ITEM_DESC).toBe('COLD ROLLED STEEL SHEET 4X8');
  });
});
