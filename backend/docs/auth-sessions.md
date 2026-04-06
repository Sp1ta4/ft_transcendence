# Authentication & Session Management

## Two-token strategy

Every authenticated user holds two tokens simultaneously:

| Token | Lifetime | Delivered via | Purpose |
|---|---|---|---|
| `accessToken` | 15 minutes | Response body | Authenticate API requests |
| `refreshToken` | 60 days | HTTP-only cookie | Obtain a new access token |

The access token is short-lived intentionally — if it leaks, it expires on its own in 15 minutes. The refresh token lives longer but is stored in an HTTP-only cookie, meaning **JavaScript on the page cannot read it**. It is sent automatically by the browser and used for one purpose only: refreshing the access token.

---

## Login

```
POST /api/v1/auth/login
Body: { email, password, fingerprint }
```

On success the server returns:

- `accessToken` — a signed JWT, put it in memory (not localStorage)
- HTTP-only cookies `refreshToken` and `sessionId` — set automatically, no action needed

**fingerprint** is a UUID you generate once on the client side and persist (e.g. in localStorage). It represents the current browser/device. You send it on login, refresh, and logout. The server uses it to bind the session to the original device — if someone steals your cookies and tries to use them from a different device, the fingerprint won't match and the session will be rejected.

---

## Making authenticated requests

Attach the access token to every request as a Bearer token:

```
Authorization: Bearer <accessToken>
```

The server verifies the JWT signature locally — no database or Redis lookup happens on every request.

---

## Refreshing the access token

When a request returns `401`, the access token has expired. Refresh it:

```
POST /api/v1/auth/refresh
Body: { userId, fingerprint }
```

The browser attaches the `refreshToken` and `sessionId` cookies automatically.

On success:
- A new `accessToken` is returned in the response body
- New `refreshToken` and `sessionId` cookies are set (old ones are invalidated)
- **Retry the original failed request** with the new access token

On failure (expired session, mismatched fingerprint, etc.):
- Cookies are cleared by the server
- Redirect the user to the login page

> Each refresh is a **one-time operation** — the old refresh token is immediately invalidated and replaced. If two concurrent requests both try to refresh at the same time, one will fail. Handle this with a refresh queue on the client side.

---

## Logout

```
POST /api/v1/auth/logout
Body: { userId, sessionId }
```

The server deletes only the current session. Other devices remain logged in.

---

## Multi-device sessions

Each device gets its own independent session. A user can have up to **3 active sessions** at a time. When a 4th device logs in, the oldest session is evicted automatically.

```
User ID 42
├── session A  →  Phone   (own refreshToken, own fingerprint)
├── session B  →  Laptop  (own refreshToken, own fingerprint)
└── session C  →  Tablet  (own refreshToken, own fingerprint)
```

- Logging out on one device does not affect the others
- A stolen cookie from one device cannot be used on another (fingerprint mismatch)
- Sessions have an **absolute expiration of 60 days** from creation. After that, the session cannot be refreshed regardless of activity — the user must log in again

---

## Recommended client-side flow

```
App starts
  └─► load accessToken from memory (or skip if not present)

Request to API
  └─► attach Authorization: Bearer <accessToken>
      ├─► 200  →  done
      └─► 401  →  POST /refresh
                    ├─► success  →  save new accessToken, retry original request
                    └─► failure  →  clear local state, redirect to /login

Login
  └─► POST /login → save accessToken in memory, save userId in localStorage

Logout
  └─► POST /logout → clear accessToken from memory, clear userId from localStorage
```

> Store the `accessToken` in **memory only** (a module-level variable or React state), not in localStorage or sessionStorage. The `refreshToken` is in an HTTP-only cookie and requires no handling on your end.
