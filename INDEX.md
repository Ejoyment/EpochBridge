# 📖 EpochBridge Documentation Index

**Quick navigation to all project documentation.**

---

## 🚀 Getting Started (Read These First)

### 1. **[NEXT_STEPS.md](./NEXT_STEPS.md)** ⭐ START HERE
   - Immediate action required (Node version)
   - Installation instructions
   - First-time setup guide
   - Success criteria

### 2. **[QUICKSTART.md](./QUICKSTART.md)**
   - 5-minute setup guide
   - Minimal steps to get running
   - First query examples
   - Basic troubleshooting

### 3. **[README.md](./README.md)**
   - Complete project overview
   - Architecture diagrams
   - Full API reference
   - Deployment guides
   - **READ THIS FOR COMPLETE UNDERSTANDING**

---

## 📚 Reference Documentation

### **[PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)**
   - What's implemented
   - Project structure
   - File tree
   - Statistics
   - Completion status

### **[TESTING_GUIDE.md](./TESTING_GUIDE.md)**
   - Complete test scenarios
   - Query examples for all features
   - CDC subscription tests
   - Security tests
   - Performance tests
   - Test checklists

### **[INSTALLATION_NOTES.md](./INSTALLATION_NOTES.md)**
   - Node version compatibility
   - Dependency issues
   - Platform-specific setup
   - Build troubleshooting
   - Alternative installation methods

---

## 📁 Configuration Files

### Environment & Config
- **`.env`** — Environment variables (edit this!)
- **`.env.example`** — Template for environment vars
- **`tsconfig.json`** — TypeScript configuration
- **`package.json`** — Dependencies and scripts

### Docker
- **`Dockerfile`** — Production container image
- **`docker-compose.yml`** — Kafka + Zookeeper services

### Git
- **`.gitignore`** — Files excluded from version control

---

## 💻 Source Code Map

### Core Application
```
src/
├── index.ts                    # Main entry point
├── config/index.ts             # Configuration loader
├── types/index.ts              # TypeScript type definitions
└── utils/logger.ts             # Winston logging
```

### GraphQL Layer
```
src/gateway/
├── schema.ts                   # GraphQL type definitions (SDL)
└── resolvers.ts                # Query/Mutation/Subscription logic
```

### Database Layer
```
src/legacy-db/
├── connection.ts               # SQLite connection manager
└── seed.ts                     # Database seeder script
```

### CDC Streaming
```
src/cdc/
├── producer.ts                 # CDC polling & Kafka producer
├── consumer.ts                 # Kafka consumer
└── pubsub-bridge.ts            # GraphQL subscription integration
```

### Intelligence
```
src/intelligence/
└── schema-generator.ts         # LLM-assisted schema generation
```

### Security
```
src/middleware/
└── security.ts                 # Rate limiting, depth limiting
```

---

## 🎯 Quick Reference by Task

### "I want to get it running"
→ Read **[NEXT_STEPS.md](./NEXT_STEPS.md)** → **[QUICKSTART.md](./QUICKSTART.md)**

### "I want to understand the architecture"
→ Read **[README.md](./README.md)** (Architecture section)

### "I want to test all features"
→ Read **[TESTING_GUIDE.md](./TESTING_GUIDE.md)**

### "I'm having installation issues"
→ Read **[INSTALLATION_NOTES.md](./INSTALLATION_NOTES.md)**

### "I want to see what's built"
→ Read **[PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)**

### "I want to customize it"
→ Read **[README.md](./README.md)** (Development section)

### "I want to deploy it"
→ Read **[README.md](./README.md)** (Docker Deployment section)

### "I want to add new features"
→ Review `src/` code + **[README.md](./README.md)** (Project Structure)

---

## 📊 GraphQL API Quick Reference

### Query Examples

```graphql
# List customers
{ allCustomers(limit: 5) { custId custName } }

# Get single customer
{ customer(id: "C0001") { custId custName custCity } }

# List inventory
{ allInventory(limit: 10) { itemId itemDesc itemQty } }

# Get orders with relations
{ 
  allOrders(limit: 3) { 
    ordrId ordrDate
    customer { custName }
    lineItems { item { itemDesc } }
  } 
}

# Health check
{ health { status uptime messagesProcessed } }
```

### Mutation Examples

```graphql
# Update customer
mutation { 
  updateCustomer(id: "C0001", creditLimit: 600000) { 
    custId custCrdt 
  } 
}

# Update inventory
mutation { 
  updateInventoryQuantity(id: "ITM-001", quantity: 3000) { 
    itemId itemQty 
  } 
}

# Create order
mutation { 
  createOrder(customerId: "C0002", notes: "RUSH") { 
    ordrId ordrDate 
  } 
}
```

### Subscription Example

```graphql
# Stream CDC events
subscription { 
  cdcEvent(table: "CUSTMAST") { 
    operation table timestamp after 
  } 
}
```

---

## 🔧 Common Commands

```bash
# Development
npm run dev          # Start dev server with hot reload
npm run build        # Compile TypeScript
npm run seed         # Seed database with sample data
npm test             # Run tests
npm run lint         # Lint code

# Docker
docker-compose up -d     # Start Kafka + Zookeeper
docker-compose down      # Stop services
docker build -t epochbridge:latest .  # Build image
docker run -p 4000:4000 epochbridge:latest  # Run container

# Database
sqlite3 data/legacy.db              # Open database
sqlite3 data/legacy.db ".tables"    # List tables
sqlite3 data/legacy.db "SELECT * FROM CUSTMAST;"  # Query

# Logs
tail -f logs/combined.log   # Watch all logs
tail -f logs/error.log      # Watch errors only

# Health Check
curl http://localhost:4000/health
```

---

## 🗂️ File Organization

```
EpochBridge/
├── 📘 Documentation (7 files)
│   ├── INDEX.md                    ← You are here
│   ├── NEXT_STEPS.md              ⭐ Start here!
│   ├── QUICKSTART.md              
│   ├── README.md                  📖 Main docs
│   ├── PROJECT_SUMMARY.md
│   ├── TESTING_GUIDE.md
│   └── INSTALLATION_NOTES.md
│
├── 💻 Source Code (14 files)
│   └── src/
│       ├── index.ts
│       ├── cdc/                   (3 files)
│       ├── config/                (1 file)
│       ├── gateway/               (2 files)
│       ├── intelligence/          (1 file)
│       ├── legacy-db/             (2 files)
│       ├── middleware/            (1 file)
│       ├── types/                 (1 file)
│       └── utils/                 (1 file)
│
├── ⚙️ Configuration (6 files)
│   ├── .env
│   ├── .env.example
│   ├── .gitignore
│   ├── tsconfig.json
│   ├── package.json
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── 📂 Runtime (auto-generated)
│   ├── data/                      SQLite database
│   ├── logs/                      Application logs
│   ├── dist/                      Compiled JavaScript
│   └── node_modules/              Dependencies
│
└── 🔧 Scripts
    └── scripts/write-source-files.py
```

---

## 🎓 Learning Path

### Day 1: Setup & Basic Usage
1. Read NEXT_STEPS.md
2. Install Node v20
3. Run `npm install && npm run seed && npm run dev`
4. Open http://localhost:4000/graphql
5. Run 5 queries from TESTING_GUIDE.md

### Day 2: Understanding Architecture
1. Read full README.md
2. Review src/index.ts
3. Review src/gateway/schema.ts
4. Test CDC subscriptions
5. Review src/cdc/ files

### Day 3: Deep Dive
1. Read all source code files
2. Understand resolver logic
3. Test LLM schema generation
4. Review security middleware
5. Customize a query

### Week 2+: Advanced Topics
1. Add authentication
2. Connect real legacy database
3. Configure Kafka cluster
4. Add new GraphQL types
5. Deploy to production

---

## 🔗 External Resources

### GraphQL
- [GraphQL.org Learn](https://graphql.org/learn/)
- [Apollo Server Docs](https://www.apollographql.com/docs/apollo-server/)
- [GraphQL Best Practices](https://graphql.org/learn/best-practices/)

### Change Data Capture
- [Kafka Documentation](https://kafka.apache.org/documentation/)
- [Debezium Tutorial](https://debezium.io/documentation/)

### Legacy Modernization
- [IBM AS/400 Support](https://www.ibm.com/support/pages/as400)
- [COBOL Modernization Guide](https://www.microfocus.com/modernization)

### TypeScript & Node.js
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Node.js Guides](https://nodejs.org/en/docs/guides/)

---

## 📞 Support

### Documentation Issues
If documentation is unclear, check:
1. README.md for detailed explanations
2. TESTING_GUIDE.md for concrete examples
3. Source code comments

### Technical Issues
1. Check INSTALLATION_NOTES.md
2. Review error logs in `logs/`
3. Search GitHub issues (if public repo)
4. Contact: support@epochbridge.io

---

## ✅ Document Versions

| Document | Last Updated | Status |
|----------|-------------|--------|
| INDEX.md | 2024-01-15 | ✅ Current |
| NEXT_STEPS.md | 2024-01-15 | ✅ Current |
| README.md | 2024-01-15 | ✅ Current |
| QUICKSTART.md | 2024-01-15 | ✅ Current |
| PROJECT_SUMMARY.md | 2024-01-15 | ✅ Current |
| TESTING_GUIDE.md | 2024-01-15 | ✅ Current |
| INSTALLATION_NOTES.md | 2024-01-15 | ✅ Current |

---

## 🎯 Your Next Steps

**Right now, you should:**

1. ✅ Read **[NEXT_STEPS.md](./NEXT_STEPS.md)** (5 minutes)
2. ⚙️ Install Node v20 (5 minutes)
3. 📦 Run `npm install` (2 minutes)
4. 🌱 Run `npm run seed` (10 seconds)
5. 🚀 Run `npm run dev` (start server)
6. 🎉 Open http://localhost:4000/graphql and start querying!

**Total time to success: ~15 minutes**

---

**Welcome to EpochBridge! 🌉**

*Modern APIs for legacy systems — bridging decades of technology.*
