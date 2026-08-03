import { gql } from 'graphql-tag';

export const typeDefs = gql`
  scalar JSON

  """A customer record from the legacy CUSTMAST physical file"""
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

  """An inventory item from the legacy INVNTRY physical file"""
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

  """An order header from the legacy ORDERHDR physical file"""
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

  """An order line item from the legacy ORDERDTL physical file"""
  type OrderDetail {
    dtailId: String!
    ordrId: String!
    itemId: String!
    dtailQty: Int
    dtailUprc: Float
    dtailExt: Float
    item: Inventory
  }

  """A Change Data Capture event streamed from the legacy database"""
  type CDCEvent {
    id: String!
    operation: String!
    table: String!
    database: String!
    timestamp: String!
    before: JSON
    after: JSON
  }

  """Gateway health and telemetry"""
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
    """Stream all CDC events from the legacy database"""
    cdcEvent(table: String): CDCEvent
  }
`;
