# Authentication

The auth system uses a **two-token strategy**:

- **Access token** — short-lived JWT (default 15 min), sent in the `Authorization` header.
- **Refresh token** — long opaque token (60-day absolute expiry), stored as an httpOnly cookie along with a `sessionId` cookie.

Sessions are stored in Redis. A user can have up to **3 active sessions** simultaneously (configurable via `MAX_DEVICES`).

---

## Registration Flow

```
Client                          Server                        Redis
  │                               │                             │
  │── POST /auth/register ────────▶                             │
  │   {first_name, email, ...}    │                             │
  │                               │── validate schema ──────────│
  │                               │── check email unique ───────┤ getUserByEmail()
  │                               │                             │
  │                               │── generate 6-char code      │
  │                               │── SET email_confirmation_code:{email}
  │                               │   JSON({...userData, code}) EX 15min ──▶│
  │                               │                             │
  │◀── 200 { message } ───────────│                             │
  │                               │                             │
  │── POST /auth/confirm ─────────▶                             │
  │   {email, confirmation_code}  │                             │
  │                               │── GET email_confirmation_code:{email} ──▶│
  │                               │◀─ userData+code ────────────│
  │                               │── compare code              │
  │                               │── bcrypt.hash(password)     │
  │                               │── prisma.user.create()      │
  │                               │── DEL email_confirmation_code:{email} ──▶│
  │◀── 201 { message } ───────────│                             │
```

**Notes:**
- The confirmation code is 6 alphanumeric characters generated with `Math.random().toString(36).substring(2, 8)`.
- In development mode the code is logged to stdout (no email service is wired yet).
- The code TTL is 15 minutes (`USER_EMAIL_CONFIRMATION_CODE_TTL = 900`).

---

## Login Flow

```
Client                          Server                        Redis / DB
  │                               │                             │
  │── POST /auth/login ───────────▶                             │
  │   {email, password,           │                             │
  │    fingerprint}               │── validate schema           │
  │                               │── prisma.user.findUnique() ─▶ DB
  │                               │◀─ user ─────────────────────│
  │                               │── bcrypt.compare()          │
  │                               │                             │
  │                               │── addNewSession():          │
  │                               │   check zCard(sessions) ───▶│
  │                               │   if >= 3: zPopMin + del ──▶│
  │                               │   ZADD user:{id}:sessions ─▶│
  │                               │   SET session:{id}:{sid} ──▶│
  │                               │                             │
  │                               │── jwt.sign({sub, sid})      │
  │                               │                             │
  │◀── 200 {accessToken, user} ───│                             │
  │    cookie: refreshToken       │                             │
  │    cookie: sessionId          │                             │
```

### Session data stored in Redis

```
user:{userId}:sessions        ZSET
  member: sessionId
  score:  timestamp (moment.now())
  TTL:    REFRESH_TTL seconds

session:{userId}:{sessionId}  STRING (JSON)
  {
    tokenHash:        SHA-256 hex of the refreshToken,
    fingerprint:      device fingerprint UUID,
    createdAt:        Unix ms timestamp,
    absoluteExpireAt: Unix timestamp (now + 60 days)
  }
  TTL: REFRESH_TTL seconds
```

---

## Token Refresh Flow

```
Client                          Server                        Redis
  │                               │                             │
  │── POST /auth/refresh ─────────▶                             │
  │   {userId, fingerprint}       │                             │
  │   cookie: refreshToken        │── GET session:{id}:{sid} ──▶│
  │   cookie: sessionId           │◀─ storedSession ────────────│
  │                               │                             │
  │                               │── check absoluteExpireAt    │
  │                               │   if expired → 401          │
  │                               │                             │
  │                               │── sha256(refreshToken)      │
  │                               │── compare with tokenHash    │
  │                               │   if mismatch → delete ALL  │
  │                               │   sessions → throw          │
  │                               │                             │
  │                               │── compare fingerprint       │
  │                               │   if mismatch → delete ALL  │
  │                               │   sessions → throw          │
  │                               │                             │
  │                               │── DEL old session ─────────▶│
  │                               │── addNewSession() ─────────▶│
  │                               │── jwt.sign(new tokens)      │
  │                               │                             │
  │◀── 200 {accessToken} ─────────│                             │
  │    cookie: refreshToken (new) │                             │
  │    cookie: sessionId (new)    │                             │
```

**Security properties of refresh:**
- **Rotation** — every refresh issues new tokens and deletes the old session.
- **Replay detection** — if the stored `tokenHash` doesn't match the sent token, all sessions are revoked (stolen token scenario).
- **Fingerprint binding** — each session is bound to a device fingerprint; mismatch revokes all sessions.
- **Absolute expiry** — sessions expire at most 60 days after creation regardless of activity.

---

## Token Validation Flow

Used by nginx as an auth subrequest before proxying to internal services:

```
nginx                           Server (GET /auth/validate)
  │                               │
  │── Authorization: Bearer xxx ──▶
  │                               │── extract token from header
  │                               │── jwt.verify(token, ACCESS_SECRET)
  │                               │── if valid: setHeader('X-User-Id', decoded.sub)
  │◀── 200 (X-User-Id: 1) ────────│
  │  OR                           │
  │◀── 403 { error: ... } ────────│
```

---

## Logout Flow

```
Client                          Server                        Redis
  │                               │                             │
  │── POST /auth/logout ──────────▶                             │
  │   {userId, sessionId}         │── DEL session:{id}:{sid} ──▶│
  │                               │── ZREM user:{id}:sessions ─▶│
  │◀── 200 (clear cookies) ───────│                             │
```

---

## Session Limits

A user is allowed at most `MAX_DEVICES = 3` concurrent sessions.

When a new login creates a 4th session:
1. `ZCARD user:{userId}:sessions` returns the count.
2. `ZPOPMIN user:{userId}:sessions` removes and returns the oldest session.
3. The oldest `session:{userId}:{sessionId}` key is deleted.
4. The new session is added.

---

## JWT Structure

**Access token payload:**
```json
{
  "sub": "1",
  "sid": "550e8400-e29b-41d4-a716-446655440000",
  "iat": 1713355200,
  "exp": 1713356100
}
```

| Claim | Value |
|-------|-------|
| `sub` | `userId` as string |
| `sid` | `sessionId` (UUID) |
| `iat` | Issued at (Unix timestamp) |
| `exp` | Expires at (iat + ACCESS_EXPIRES) |

**Signing algorithm:** HS256 (default jsonwebtoken)
**Secret:** `ACCESS_SECRET` env variable
**Default expiry:** `ACCESS_EXPIRES` env variable (default `15m`)

---

## Password Hashing

Passwords are hashed with **bcrypt** at 10 salt rounds before being stored in the database.

```typescript
// Hash on registration confirm
const hash = await bcrypt.hash(plainPassword, 10);

// Compare on login
const match = await bcrypt.compare(plainPassword, storedHash);
```

`password_hash` in the `users` table is nullable — OAuth users created without a password will have `NULL`.
