# 🧪 EpochBridge Testing Guide

Complete guide to testing all features of EpochBridge.

---

## Prerequisites

Before testing, ensure:
- ✅ Server is running: `npm run dev`
- ✅ Database is seeded: `npm run seed`
- ✅ GraphQL Playground is accessible: http://localhost:4000/graphql

---

## 🏥 1. Health Check Tests

### REST Health Endpoint

```bash
curl http://localhost:4000/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 123.45
}
```

### GraphQL Health Query

```graphql
query HealthCheck {
  health {
    status
    uptime
    kafkaConnected
    legacyDbConnected
    activeSubscriptions
    messagesProcessed
    lastCDCEvent
  }
}
```

**Expected Response:**
```json
{
  "data": {
    "health": {
      "status": "healthy",
      "uptime": 123.45,
      "kafkaConnected": false,
      "legacyDbConnected": true,
      "activeSubscriptions": 0,
      "messagesProcessed": 0,
      "lastCDCEvent": null
    }
  }
}
```

---

## 📋 2. Customer Query Tests

### List All Customers

```graphql
query ListCustomers {
  allCustomers(limit: 10) {
    custId
    custName
    custCity
    custState
    custStat
    custCrdt
  }
}
```

**Expected:** 5 customers (C0001 through C0005)

### Get Single Customer

```graphql
query GetCustomer {
  customer(id: "C0001") {
    custId
    custName
    custAddr1
    custCity
    custState
    custZip
    custPhone
    custCrdt
    custStat
  }
}
```

**Expected:** ACME MANUFACTURING INC details

### Filter by Status

```graphql
query ActiveCustomers {
  allCustomers(status: "A") {
    custId
    custName
    custStat
  }
}
```

**Expected:** 4 active customers (status = "A")

### Pagination Test

```graphql
query PaginatedCustomers {
  page1: allCustomers(limit: 2, offset: 0) {
    custId
    custName
  }
  page2: allCustomers(limit: 2, offset: 2) {
    custId
    custName
  }
}
```

---

## 📦 3. Inventory Query Tests

### List All Inventory

```graphql
query ListInventory {
  allInventory(limit: 10) {
    itemId
    itemDesc
    itemQty
    itemPrice
    itemWhse
    itemStat
  }
}
```

**Expected:** 8 inventory items

### Get Single Item

```graphql
query GetItem {
  inventoryItem(id: "ITM-001") {
    itemId
    itemDesc
    itemUom
    itemQty
    itemCost
    itemPrice
    itemWhse
    itemStat
  }
}
```

**Expected:** COLD ROLLED STEEL SHEET 4X8

### Filter by Warehouse

```graphql
query MainWarehouse {
  allInventory(warehouse: "MAIN") {
    itemId
    itemDesc
    itemWhse
  }
}
```

**Expected:** Items in MAIN warehouse only

---

## 🛒 4. Order Query Tests

### List All Orders

```graphql
query ListOrders {
  allOrders(limit: 10) {
    ordrId
    ordrDate
    ordrStat
    ordrTotal
  }
}
```

**Expected:** 4 orders

### Get Order with Relations

```graphql
query OrderWithRelations {
  order(id: "ORD-20240001") {
    ordrId
    ordrDate
    ordrStat
    ordrTotal
    ordrNotes
    customer {
      custId
      custName
      custCity
    }
    lineItems {
      dtailId
      dtailQty
      dtailUprc
      dtailExt
      item {
        itemId
        itemDesc
        itemPrice
      }
    }
  }
}
```

**Expected:** Complete order with customer and line items

### Orders by Customer

```graphql
query CustomerOrders {
  ordersByCustomer(customerId: "C0001") {
    ordrId
    ordrDate
    ordrTotal
    ordrStat
  }
}
```

**Expected:** Orders for ACME MANUFACTURING INC

### Filter by Status

```graphql
query OpenOrders {
  allOrders(status: "O") {
    ordrId
    ordrDate
    ordrStat
  }
}
```

**Expected:** Open orders only

---

## ✏️ 5. Mutation Tests

### Update Customer Credit Limit

```graphql
mutation UpdateCustomerCredit {
  updateCustomer(id: "C0001", creditLimit: 600000) {
    custId
    custName
    custCrdt
    custUpdt
  }
}
```

**Expected:** Credit limit updated to 600000

**Verify:**
```graphql
query VerifyUpdate {
  customer(id: "C0001") {
    custCrdt
  }
}
```

### Update Customer Status

```graphql
mutation SuspendCustomer {
  updateCustomer(id: "C0005", status: "S") {
    custId
    custName
    custStat
  }
}
```

**Expected:** Status changed to "S" (Suspended)

### Update Inventory Quantity

```graphql
mutation UpdateStock {
  updateInventoryQuantity(id: "ITM-001", quantity: 3000) {
    itemId
    itemDesc
    itemQty
  }
}
```

**Expected:** Quantity updated to 3000

### Create Order

```graphql
mutation CreateNewOrder {
  createOrder(customerId: "C0002", notes: "RUSH ORDER — EXPEDITE") {
    ordrId
    custId
    ordrDate
    ordrStat
    ordrNotes
  }
}
```

**Expected:** New order created with generated ID

---

## 📡 6. CDC Subscription Tests

### Test 1: Subscribe to All CDC Events

**Tab 1 (Subscription):**
```graphql
subscription AllCDCEvents {
  cdcEvent {
    id
    operation
    table
    database
    timestamp
    before
    after
  }
}
```

**Tab 2 (Trigger Change):**
```graphql
mutation TriggerCDC {
  updateInventoryQuantity(id: "ITM-002", quantity: 200) {
    itemId
    itemQty
  }
}
```

**Expected in Tab 1:**
```json
{
  "data": {
    "cdcEvent": {
      "id": "<uuid>",
      "operation": "UPDATE",
      "table": "INVNTRY",
      "database": "LEGACY_AS400",
      "timestamp": "2024-01-15T10:30:00.000Z",
      "before": {
        "ITEM_ID": "ITM-002",
        "ITEM_QTY": 180,
        "ITEM_PRICE": 1800.0
      },
      "after": {
        "ITEM_ID": "ITM-002",
        "ITEM_QTY": 200,
        "ITEM_PRICE": 1800.0
      }
    }
  }
}
```

### Test 2: Subscribe to Specific Table

**Tab 1 (Subscription):**
```graphql
subscription CustomerChanges {
  cdcEvent(table: "CUSTMAST") {
    operation
    table
    timestamp
    after
  }
}
```

**Tab 2 (Trigger Customer Change):**
```graphql
mutation UpdateCustomer {
  updateCustomer(id: "C0003", creditLimit: 250000) {
    custId
    custCrdt
  }
}
```

**Expected:** CDC event for CUSTMAST only

### Test 3: Multiple Subscriptions

Open 3 tabs:
- Tab 1: Subscribe to all events
- Tab 2: Subscribe to CUSTMAST only
- Tab 3: Trigger changes

All active subscriptions should receive matching events.

---

## 🧠 7. LLM Schema Generation Tests

### Generate Schema (Mock Provider)

```graphql
query GenerateSchema {
  generateSchemaFromLegacyDB {
    graphqlTypeDefs
    typescriptTypes
    resolverStubs
    generatedAt
    llmProvider
  }
}
```

**Expected:**
- `llmProvider`: "mock"
- Valid GraphQL SDL in `graphqlTypeDefs`
- TypeScript interfaces in `typescriptTypes`
- Resolver stubs in `resolverStubs`

### Generate Schema (OpenAI Provider)

**Prerequisites:**
1. Set `LLM_PROVIDER=openai` in `.env`
2. Add valid `OPENAI_API_KEY`
3. Restart server

```graphql
query GenerateSchemaWithAI {
  generateSchemaFromLegacyDB {
    graphqlTypeDefs
    llmProvider
  }
}
```

**Expected:**
- `llmProvider`: "openai"
- Enriched descriptions in GraphQL types

---

## 🔐 8. Security Tests

### Rate Limiting Test

```bash
# Send 150 requests quickly (exceeds 100/15s limit)
for i in {1..150}; do
  curl -s http://localhost:4000/health &
done
wait
```

**Expected:** HTTP 429 errors after ~100 requests

### Query Depth Limit Test

```graphql
query TooDeep {
  allOrders {
    customer {
      # Depth too deep — should be rejected
    }
  }
}
```

**Expected:** Depth limit error

### Query Complexity Test

```graphql
query TooComplex {
  # Request 200+ fields
  allCustomers {
    custId custName custAddr1 custCity custState custZip custPhone custCrdt custStat custCrtd custUpdt
  }
  allInventory {
    itemId itemDesc itemUom itemQty itemCost itemPrice itemWhse itemStat
  }
  allOrders {
    ordrId ordrDate ordrShip ordrStat ordrTotal ordrNotes
    customer {
      custId custName custAddr1 custCity custState custZip custPhone custCrdt custStat
    }
    lineItems {
      dtailId dtailQty dtailUprc dtailExt
      item {
        itemId itemDesc itemUom itemQty itemCost itemPrice itemWhse itemStat
      }
    }
  }
}
```

**Expected:** Complexity error if > 200 fields

---

## 🚀 9. Performance Tests

### Concurrent Queries

```bash
# Using Apache Bench
ab -n 1000 -c 10 -T "application/json" -p query.json http://localhost:4000/graphql
```

**query.json:**
```json
{"query": "{ health { status uptime } }"}
```

**Expected:** ~95% success rate within rate limits

### Subscription Load Test

Open 10+ browser tabs with the same subscription active.

Trigger a mutation in another tab.

**Expected:** All subscriptions receive the event instantly.

---

## 🐳 10. Docker Tests

### Build Test

```bash
docker build -t epochbridge:test .
```

**Expected:** Build succeeds without errors

### Run Test

```bash
docker run -p 4000:4000 -v $(pwd)/data:/app/data epochbridge:test
```

**Expected:** Server starts and health check passes

### Docker Compose Test

```bash
docker-compose up -d
```

**Expected:**
- Zookeeper running on 2181
- Kafka running on 9092

---

## ✅ Test Checklist

### Basic Functionality
- [ ] Server starts without errors
- [ ] Health endpoint returns 200 OK
- [ ] GraphQL playground loads
- [ ] Database contains seeded data

### Queries
- [ ] Customer queries work (list, single, filtered)
- [ ] Inventory queries work (list, single, warehouse filter)
- [ ] Order queries work (list, single, by customer)
- [ ] Relations resolve correctly (customer in orders, line items)

### Mutations
- [ ] Update customer credit limit
- [ ] Update customer status
- [ ] Update inventory quantity
- [ ] Create new order

### CDC Streaming
- [ ] Subscription connects successfully
- [ ] Mutations trigger CDC events
- [ ] Events appear in subscriptions
- [ ] Table filtering works

### Security
- [ ] Rate limiting blocks excess requests
- [ ] Query depth limit enforced
- [ ] Security headers present in responses

### Intelligence
- [ ] Mock schema generation works
- [ ] OpenAI schema generation works (with API key)

### DevOps
- [ ] TypeScript compiles without errors
- [ ] Docker build succeeds
- [ ] Docker container runs successfully
- [ ] Docker Compose starts Kafka

---

## 📊 Expected Results Summary

| Test Category | Expected Pass Rate |
|--------------|-------------------|
| Health Checks | 100% |
| Query Tests | 100% |
| Mutation Tests | 100% |
| CDC Tests | 100% |
| Security Tests | 100% |
| LLM Tests | 100% (mock), 95% (OpenAI) |
| Docker Tests | 100% |

---

## 🐛 Troubleshooting Failed Tests

### Subscription not receiving events?
- Check that server logs show CDC polling active
- Verify CHANGE_LOG table exists
- Restart server to reinitialize triggers

### Mutations not working?
- Check database file permissions
- Verify database is not read-only
- Check server logs for SQL errors

### Rate limiting too aggressive?
- Adjust `max` in `src/middleware/security.ts`
- Restart server after changes

### OpenAI tests failing?
- Verify `OPENAI_API_KEY` is valid
- Check OpenAI account has credits
- Review server logs for API errors

---

## 📝 Test Report Template

```markdown
# EpochBridge Test Report

**Date:** YYYY-MM-DD
**Tester:** Your Name
**Environment:** Development / Docker / Production

## Test Results

| Test Category | Tests Run | Passed | Failed | Notes |
|--------------|-----------|--------|--------|-------|
| Health Checks | 2 | 2 | 0 | ✅ |
| Queries | 12 | 12 | 0 | ✅ |
| Mutations | 5 | 5 | 0 | ✅ |
| Subscriptions | 3 | 3 | 0 | ✅ |
| Security | 3 | 3 | 0 | ✅ |
| LLM | 2 | 2 | 0 | ✅ |
| Docker | 3 | 3 | 0 | ✅ |

**Total:** 30 tests, 30 passed, 0 failed

## Issues Found

None

## Recommendations

- All tests passing
- Ready for staging deployment
```

---

**Happy Testing! 🚀**
