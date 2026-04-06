# ft_transcendence — Backend API Documentation

## Overview

REST API backend for a social network platform. Built with Node.js/Express using a **Repository → Service → Controller** layered architecture and a custom IoC dependency injection container.

**Stack:** Node.js 20, Express, PostgreSQL (Prisma), Redis, JWT, bcrypt, Joi

---

## Project Structure

```
ft_transcendence/
├── docker-compose.yml
├── .env
├── nginx/
│   ├── Dockerfile
│   └── nginx.conf
├── redis/
│   ├── Dockerfile
│   └── redis.conf
├── postgresql/
│   ├── Dockerfile
│   └── postgresql.conf
└── backend/
    ├── Dockerfile
    ├── server.js
    ├── app.js
    ├── prisma/
    │   └── schema.prisma
    └── src/
        ├── container.js
        ├── resources/
        ├── modules/
        ├── routes/
        ├── middlewares/
        ├── utils/
        └── constants/
```

---

## Getting Started

### Local development

```bash
cd backend
npm install
npx prisma generate
# configure environment variables (see backend/.env.example)
npm run migrate:dev
npm run dev
```

### Docker

```bash
# from project root
cp .env.example .env   # fill in your values
docker compose up --build
```

Services exposed:
- `http://localhost:8080` — nginx (proxies `/api/` → backend)

**Scaling backend instances:**
```bash
docker compose up --build --scale backend=3
```
nginx automatically load balances across all running backend containers using Docker DNS. Strategy: `least_conn` (routes to the instance with fewest active connections).

**Restart policies:** all services except `migrate` use `restart: unless-stopped` — they come back automatically after a crash or host reboot.

**Updating nginx config:**
```bash
docker compose up --build nginx
```

---

## Environment Variables

The root `.env` is used by Docker Compose. For local development copy `backend/.env.example` to `backend/.env`.

| Variable | Description |
|---|---|
| `PORT` | Server port (default `3000` in Docker, `8080` local) |
| `NODE_ENV` | `development` / `production` |
| `DATABASE_URL` | Prisma connection string — `postgresql://user:pass@host:5432/dbname` |
| `DB_USER`, `DB_PASS`, `DB_NAME` | Used by the postgres Docker service |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Redis connection |
| `ACCESS_SECRET` | JWT signing secret |
| `ACCESS_EXPIRES` | JWT expiration (e.g. `15m`) |
| `REFRESH_TTL` | Refresh session TTL in seconds (e.g. `5184000` = 60 days) |

---

## API Reference

**Base URL:** `/api/v1`

---

### Auth — `/api/v1/auth`

#### `POST /register`

Initiates registration. Validates input, checks email uniqueness, stores user data in Redis, and sends a 6-digit confirmation code.

**Body:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "username": "johndoe",
  "password": "pass1234",
  "birth_date": "1995-06-15",
  "role": "user",
  "avatar_url": "https://..."
}
```

> `role` and `avatar_url` are optional.

**Validation:** `password` must be 8–64 characters and contain both letters and digits. `birth_date` must be in the past.

---

#### `POST /confirm`

Confirms email with the 6-digit code and creates the user in the database.

**Body:**
```json
{
  "email": "john@example.com",
  "confirmation_code": "482910"
}
```

---

#### `POST /login`

Authenticates a user, creates a session, returns an access token.

**Body:**
```json
{
  "email": "john@example.com",
  "password": "pass1234",
  "fingerprint": "550e8400-e29b-41d4-a716-446655440000"
}
```

`fingerprint` is a UUID representing the client device. Used to detect session hijacking on refresh.

**Response:** `{ "accessToken": "<jwt>", "user": { ... } }` + HTTP-only cookies `refreshToken`, `sessionId`.

> A user may have at most **3 active sessions**. The oldest is evicted when this limit is exceeded.

---

#### `POST /refresh`

Rotates the refresh token and returns a new access token. Reads `refreshToken` and `sessionId` from HTTP-only cookies.

**Body:**
```json
{
  "userId": 42,
  "fingerprint": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:** `{ "accessToken": "<jwt>" }`. Cookies are cleared on failure.

> Sessions have an **absolute expiration of 60 days** and cannot be refreshed after that.

---

#### `POST /logout`

Invalidates a session and clears cookies.

**Body:**
```json
{
  "userId": 42,
  "sessionId": "session-uuid"
}
```

---

#### `GET /validate`

Validates a JWT access token. Intended for use by an API gateway.

**Header:** `Authorization: Bearer <token>`

**Response:** Sets `X-User-Id` response header on success.

---

### Users — `/api/v1/users`

#### `POST /list`

Returns a list of all users.

**Response:** `{ "data": [ ...users ] }`

---

## Session Management

Sessions are stored in Redis:

- `email_confirmation_code:{email}` — pending registration data, TTL 15 minutes
- `user:{userId}:sessions` — sorted set of active session IDs
- `session:{userId}:{sessionId}` — session hash: `tokenHash`, `fingerprint`, `createdAt`, `absoluteExpireAt`

The raw refresh token is never persisted — only its **SHA-256 hash** is stored. `fingerprint` binds the session to the originating device.

---

## Error Handling

All errors are caught by global middleware and returned as:

```json
{ "error": "Human-readable message" }
```

| Class | Status | Usage |
|---|---|---|
| `HttpError` | any | Base: `new HttpError(status, message)` |
| `DataValidationError` | 400 | Joi validation failures |
| `InternalServerError` | 500 | Unexpected server errors |

---

## NPM Scripts

Run from the `backend/` directory.

| Script | Description |
|---|---|
| `npm run dev` | Start with nodemon |
| `npm start` | Start production server |
| `npm run generate` | Regenerate Prisma client after schema changes |
| `npm run migrate` | Apply pending migrations (production / Docker) |
| `npm run migrate:dev` | Create and apply a new migration (development) |
| `npm run migrate:make` | Create a named migration — append `-- --name <name>` |
| `npm run migrate:reset` | Drop and recreate the database, rerun all migrations |
| `npm run db:pull` | Introspect existing database and update schema |
| `npm run studio` | Open Prisma Studio (visual DB browser) |
