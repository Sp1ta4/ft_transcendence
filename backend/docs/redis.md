# Redis

Redis is used exclusively for **session management** and **temporary registration data**. It is not used as a general-purpose cache for database queries.

---

## Connection

**`src/resources/redis.ts`:**

```typescript
const redis = createClient({
  socket: {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: process.env['REDIS_PORT'] ? parseInt(process.env['REDIS_PORT'], 10) : 6379,
  },
  password: process.env['REDIS_PASSWORD'],
});
```

The client connects eagerly at startup. Connectivity is verified in `main.ts` by writing and reading a test key before the server starts accepting requests.

---

## Data Structures

### 1. Email Confirmation Code

Stores registration data + the confirmation code while the user hasn't confirmed their email.

| Property | Value |
|----------|-------|
| **Key** | `email_confirmation_code:{email}` |
| **Type** | STRING (JSON) |
| **TTL** | 900 seconds (15 minutes) |

**Value shape:**
```json
{
  "first_name": "John",
  "last_name":  "Doe",
  "email":      "john@example.com",
  "username":   "johndoe",
  "password":   "Secret42",
  "birth_date": "1995-06-15T00:00:00.000Z",
  "role":       "user",
  "code":       "a1b2c3"
}
```

**Lifecycle:**
1. Created by `POST /auth/register` with `EX 900`.
2. Read and deleted by `POST /auth/confirm`.
3. Expires automatically after 15 minutes if not confirmed.

---

### 2. User Session Index

A sorted set tracking all active session IDs for a user, ordered by creation time.

| Property | Value |
|----------|-------|
| **Key** | `user:{userId}:sessions` |
| **Type** | ZSET |
| **TTL** | `REFRESH_TTL` seconds (default 5 184 000 ≈ 60 days) |

**Members:**
- **member** — `sessionId` (UUID string)
- **score** — creation timestamp in milliseconds (`moment.now()`)

**Used for:**
- `ZCARD` — checking how many sessions a user has (device limit = 3).
- `ZPOPMIN` — removing the oldest session when the device limit is reached.
- `ZRANGE 0 -1` — listing all sessions to bulk-delete them (logout all).
- `ZREM` — removing a specific session on logout.

---

### 3. Session Data

Stores cryptographic and metadata for a single session.

| Property | Value |
|----------|-------|
| **Key** | `session:{userId}:{sessionId}` |
| **Type** | STRING (JSON) |
| **TTL** | `REFRESH_TTL` seconds (default 5 184 000 ≈ 60 days) |

**Value shape:**
```json
{
  "tokenHash":        "e3b0c44298fc1c149afb...",
  "fingerprint":      "550e8400-e29b-41d4-a716-446655440000",
  "createdAt":        1713355200000,
  "absoluteExpireAt": 1718539200
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tokenHash` | string | SHA-256 hex of the refresh token (the token itself is never stored) |
| `fingerprint` | string (UUID) | Device identifier sent with every refresh request |
| `createdAt` | number | Unix milliseconds timestamp of session creation |
| `absoluteExpireAt` | number | Unix seconds timestamp: `createdAt + 60 days` — hard expiry regardless of activity |

**Used for:**
- `GET` — validate the refresh token and fingerprint on `POST /auth/refresh`.
- `SET ... EX` — created on login or token refresh.
- `DEL` — removed on logout or when a security violation is detected.

---

## Key Summary

```
email_confirmation_code:{email}   STRING   TTL 15 min
user:{userId}:sessions            ZSET     TTL 60 days
session:{userId}:{sessionId}      STRING   TTL 60 days
```

---

## Security Design

### Refresh Token Storage

The raw refresh token is **never stored in Redis**. Only its SHA-256 hex digest (`tokenHash`) is stored. On refresh, the server:

1. Hashes the incoming token: `sha256Hex(receivedToken)`.
2. Compares the hash with `storedSession.tokenHash`.
3. Proceeds only if they match.

This means even if Redis is compromised, the attacker cannot use the stored hash as a refresh token.

### Refresh Token Rotation

Every successful `POST /auth/refresh`:
- Deletes the old `session:{userId}:{sessionId}` key.
- Creates a new session with a new `sessionId` and `refreshToken`.

Tokens are **single-use**.

### Replay Detection

If the incoming `tokenHash` does **not** match the stored hash (e.g., a token was stolen and the attacker used it first), the server:
- Deletes **all** sessions for that user (`deleteAllSessions`).
- Returns an error.

This forces every device to re-authenticate, mitigating stolen-token attacks.

### Fingerprint Binding

Each session stores the `fingerprint` of the device that created it. If the fingerprint on a refresh request doesn't match the stored one:
- All sessions are revoked.
- The user must re-authenticate.

### Absolute Expiry

Sessions have a hard expiry of 60 days from creation (`absoluteExpireAt`), regardless of activity. This prevents indefinitely long-lived sessions from accumulating in Redis.
