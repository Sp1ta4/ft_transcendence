# Backend — Documentation

TypeScript REST API built with Express.js, PostgreSQL (Prisma ORM), and Redis.

## Table of Contents

- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Architecture](./architecture.md)
- [API Reference](./api.md)
- [Authentication](./auth.md)
- [Database](./database.md)
- [Redis](./redis.md)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Generate Prisma client (required before first run)
npm run generate

# 4. Apply database migrations
npm run migrate:dev

# 5. Start in development mode
npm run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development mode with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled server |
| `npm run generate` | Generate Prisma client |
| `npm run migrate:dev` | Create and apply a migration (dev) |
| `npm run migrate` | Apply pending migrations (prod) |
| `npm run migrate:make <name>` | Create a named migration |
| `npm run migrate:reset` | Drop and recreate the database |
| `npm run studio` | Open Prisma Studio |

---

## Project Structure

```
backend_new/
├── src/
│   ├── main.ts                    # Entry point — HTTP server startup
│   ├── app.ts                     # Express app, global middleware
│   ├── container.ts               # DI container (all singleton instances)
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts # HTTP handlers
│   │   │   ├── auth.service.ts    # Business logic
│   │   │   └── auth.repository.ts # Redis session storage
│   │   └── users/
│   │       ├── users.controller.ts
│   │       ├── users.service.ts
│   │       └── users.repository.ts # Prisma queries + Redis cache
│   │
│   ├── routes/
│   │   ├── index.ts               # Root router
│   │   ├── auth.router.ts
│   │   └── users.router.ts
│   │
│   ├── middlewares/
│   │   └── errorHandler.ts        # Global error handler
│   │
│   ├── resources/
│   │   ├── prisma.ts              # PrismaClient singleton (PostgreSQL)
│   │   └── redis.ts               # Redis client singleton
│   │
│   ├── constants/
│   │   ├── error_messages.ts
│   │   ├── success_messages.ts
│   │   └── users.ts               # TTLs, device limits
│   │
│   ├── types/
│   │   └── express.d.ts           # Extends Request with userId
│   │
│   └── utils/
│       ├── validateSchema.ts      # Generic Joi validator
│       ├── checkEmailUnique.ts
│       ├── jwt.ts                 # signAccess / verifyAccess
│       ├── passwordUtils.ts       # bcrypt hash / compare
│       ├── hash.ts                # sha256Hex, randomLong
│       └── error/
│           ├── HttpError.ts
│           └── DataValidationError.ts
│
├── prisma/
│   ├── schema/                    # Multi-file Prisma schema
│   │   ├── schema.prisma          # datasource + generator config
│   │   ├── user.prisma
│   │   ├── post.prisma
│   │   ├── conversation.prisma
│   │   └── notification.prisma
│   └── migrations/
│
├── docs/                          # This documentation
├── dist/                          # Compiled JavaScript output
├── .env.example
├── prisma.config.ts
├── tsconfig.json
└── package.json
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | number | `8080` | Server port |
| `NODE_ENV` | string | `development` | Environment (`development` / `production`) |
| `DATABASE_URL` | string | — | PostgreSQL connection string (**required**) |
| `DB_USER` | string | — | Database user |
| `DB_PASS` | string | — | Database password |
| `DB_NAME` | string | — | Database name |
| `REDIS_HOST` | string | `localhost` | Redis host |
| `REDIS_PORT` | number | `6379` | Redis port |
| `REDIS_PASSWORD` | string | — | Redis password |
| `ACCESS_SECRET` | string | — | JWT signing secret (**required**) |
| `ACCESS_EXPIRES` | string | `15m` | Access token lifetime |
| `REFRESH_TTL` | number | `5184000` | Session TTL in seconds (60 days) |

> `DATABASE_URL` and `ACCESS_SECRET` are required — the server will not start without them.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js (ESM) |
| Language | TypeScript 5 (`module: nodenext`) |
| Framework | Express 4 |
| ORM | Prisma 7 |
| Database | PostgreSQL |
| Cache / Sessions | Redis 5 |
| Validation | Joi |
| Authentication | JWT (jsonwebtoken) + bcrypt |
| Dev runner | tsx |
