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

---

## OAuth 2.0 (Google & GitHub)

OAuth is implemented without Passport.js using a custom Strategy pattern (`src/modules/auth/utils.ts`).

### Supported providers

| Constant | Value | Scopes |
|----------|-------|--------|
| `GOOGLE_OAUTH_PROVIDER` | `"google"` | `openid email profile` |
| `GITHUB_OAUTH_PROVIDER` | `"github"` | `read:user user:email` |

### Initiate Flow

```
Client                          Server
  │                               │
  │── POST /auth/oauth/initiate/:provider ──▶
  │   { fingerprint: uuid }       │
  │                               │── generateOAuthState(fingerprint):
  │                               │     nonce = randomBytes(16)
  │                               │     hmac  = HMAC-SHA256(nonce, ACCESS_SECRET)
  │                               │     state = base64url({ nonce, hmac, fingerprint, iat })
  │                               │
  │                               │── strategy.buildAuthUrl(state)
  │◀── 307 Redirect to provider ──│
```

The `state` parameter provides CSRF protection:
- `hmac` is verified server-side on callback.
- `iat` is checked — state expires after **10 minutes**.
- `fingerprint` is embedded to bind the session to the initiating device.

### Callback Flow

```
Provider                        Server                        DB / Redis
  │                               │                             │
  │── GET /auth/oauth/callback/:provider?code=...&state=... ──▶│
  │                               │── base64url.decode(state)   │
  │                               │── verify HMAC signature     │
  │                               │── check iat (10 min TTL)    │
  │                               │                             │
  │                               │── exchangeCodeForTokens()   │
  │                               │   POST provider/token ──────▶ Provider API
  │                               │◀── tokens ──────────────────│
  │                               │                             │
  │                               │── getUserInfo():            │
  │                               │   Google: decode id_token JWT
  │                               │   GitHub: GET /user (+ /user/emails if email hidden)
  │                               │                             │
  │                               │── upsertUserFromOAuth():    │
  │                               │   prisma.oAuthAccount.upsert()
  │                               │   - exists → update avatar  │
  │                               │   - new    → create User + OAuthAccount
  │                               │                             │
  │                               │── addNewSession(userId, fingerprint)
  │                               │── signAccess(userId, sessionId)
  │                               │                             │
  │◀── 200 { accessToken } ───────│                             │
  │    cookie: refreshToken       │                             │
  │    cookie: sessionId          │                             │
```

### upsertUserFromOAuth

Located in `UsersRepository`. Key behaviour:
- Lookup key: `(provider, provider_user_id)` — unique constraint on `oauth_accounts`.
- **Existing account** → updates `avatar_url` on the linked user.
- **New account** → creates a `User` record (no `password_hash`) and an `OAuthAccount` record.
- Username is auto-generated from the email local part; collisions get a `_N` suffix.

### State Validation (Callback)

```typescript
// 1. Decode
const { nonce, hmac, iat, fingerprint } = JSON.parse(
  Buffer.from(state, 'base64url').toString()
);

// 2. Check TTL
if (Date.now() - iat > 10 * 60 * 1000) throw 400 'State expired';

// 3. Verify HMAC (constant-time)
const expected = crypto.createHmac('sha256', ACCESS_SECRET).update(nonce).digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex')))
  throw 400 'Invalid state signature';
```
