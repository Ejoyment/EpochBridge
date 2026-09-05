# EpochBridge

![Node](https://img.shields.io/badge/Node.js-18+-339933)
![License](https://img.shields.io/badge/license-MIT-green)

A GraphQL gateway that demonstrates how to modernize access to legacy-style databases using Change Data Capture (CDC) streaming — with LLM-assisted schema generation on top.

I built this to explore how legacy systems (like AS/400-style databases) can be exposed through a modern GraphQL API without a full rewrite, using CDC to stream changes in real time rather than polling for updates manually.

## How it works

Client → GraphQL API → SQLite (AS/400-style schema)
↓
SQL trigger → CHANGE_LOG table
↓
CDC Producer (polls every 2s) → PubSub
↓
WebSocket subscription → Client


The "legacy database" is a SQLite instance modeled after AS/400 table conventions (8-character column names, CUSTMAST/INVNTRY/ORDERHDR/ORDERDTL tables) — it's a realistic simulation for development and demos, not a live mainframe connection.

## Quick Start

```bash
npm install
npm run dev
# Visit http://localhost:4000/graphql
```

Try it:
```graphql
query {
  allCustomers(limit: 5) {
    custId
    custName
    custCity
  }
}
```

Then open a second GraphQL Playground tab and subscribe to `cdcEvent` while running a mutation in the first tab — you'll see the change arrive over the WebSocket subscription in real time.

## What's working

- **GraphQL API** — 11 queries, 3 mutations, 1 subscription over a SQLite database with a type-safe schema
- **CDC streaming** — SQL triggers write to a `CHANGE_LOG` table, a producer polls every 2 seconds and publishes to an in-memory PubSub, delivered to clients via WebSocket subscriptions
- **Kafka integration** — producer/consumer code works when Kafka is running via the included `docker-compose`, and falls back gracefully when it isn't
- **LLM schema generation** — introspects the database and generates GraphQL types, TypeScript interfaces, and resolver stubs. Works in mock mode (no API key needed) or OpenAI mode (enriches descriptions with GPT-4o)
- **Basic security hardening** — IP-based rate limiting, GraphQL query depth limiting (max 7 levels), query complexity guard (max 200 fields), standard security headers
- **Dev tooling** — hot reload, TypeScript, GraphQL Playground, health check endpoint, Winston logging, Docker build

## Known limitations

**No Known limitations!**



## License

MIT
