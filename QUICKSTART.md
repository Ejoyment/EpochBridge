# 🚀 EpochBridge Quick Start

Get EpochBridge running in **under 5 minutes**.

---

## Step 1: Install Dependencies

```bash
npm install
```

---

## Step 2: Setup Environment

```bash
cp .env.example .env
```

The default `.env` is pre-configured for local development—no changes needed!

---

## Step 3: Seed the Database

```bash
npm run seed
```

This creates `./data/legacy.db` with sample AS/400-style data.

---

## Step 4: Start the Gateway

```bash
npm run dev
```

You should see:

```
╔══════════════════════════════════════════════════════════╗
║       EpochBridge Gateway — ONLINE                      ║
╠══════════════════════════════════════════════════════════╣
║  GraphQL  : http://localhost:4000/graphql          ║
║  WebSocket: ws://localhost:4000/graphql            ║
║  Portal   : http://localhost:4000/                 ║
║  Health   : http://localhost:4000/health           ║
╚══════════════════════════════════════════════════════════╝
```

---

## Step 5: Test It! 🎉

### Open the Developer Portal

Visit: **http://localhost:4000/**

### Try Your First Query

Open **http://localhost:4000/graphql** and run:

```graphql
query {
  allCustomers(limit: 3) {
    custId
    custName
    custCity
    custStat
  }
  
  health {
    status
    uptime
    messagesProcessed
  }
}
```

### Test CDC Streaming

**Tab 1** (subscribe to CDC events):
```graphql
subscription {
  cdcEvent {
    operation
    table
    after
  }
}
```

**Tab 2** (trigger a change):
```graphql
mutation {
  updateInventoryQuantity(id: "ITM-001", quantity: 3000) {
    itemId
    itemQty
  }
}
```

Watch the CDC event stream in Tab 1! ⚡

---

## ✅ You're All Set!

**Next Steps:**
- Read the full [README.md](./README.md)
- Explore the GraphQL schema in the playground
- Try the LLM schema generator: `query { generateSchemaFromLegacyDB { graphqlTypeDefs } }`
- Start Kafka with `docker-compose up -d` for full streaming

---

## 🆘 Troubleshooting

### Port 4000 already in use?

Change `PORT=4001` in `.env` and restart.

### Database not found?

Run `npm run seed` again.

### Kafka connection errors?

That's OK! EpochBridge works without Kafka using in-process PubSub. If you want Kafka:

```bash
docker-compose up -d
```

---

**Questions?** Check the [README.md](./README.md) for detailed docs.
