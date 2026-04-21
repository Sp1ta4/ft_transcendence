# API Reference

**Base URL:** `/api/v1`

All responses are JSON. Errors follow the shape `{ "error": "message" }`.

---

## Auth — `/api/v1/auth`

### POST `/auth/register`

Starts the registration flow. Stores the user data and a 6-character confirmation code in Redis for 15 minutes. In development, the code is printed to stdout.

**Request body:**

```json
{
  "first_name": "John",
  "last_name":  "Doe",
  "email":      "john@example.com",
  "username":   "johndoe",
  "password":   "Secret42",
  "birth_date": "1995-06-15",
  "role":       "user"
}
```

| Field | Type | Constraints | Required |
|-------|------|-------------|:--------:|
| `first_name` | string | 2–42 chars | ✓ |
| `last_name` | string | 2–42 chars | ✓ |
| `email` | string | valid email, unique | ✓ |
| `username` | string | alphanumeric, 3–30 chars | ✓ |
| `password` | string | 8–64 chars, ≥1 letter + ≥1 digit | ✓ |
| `birth_date` | date | must be in the past | ✓ |
| `role` | string | `"user"` \| `"admin"` | — (default: `"user"`) |

**Response `200`:**
```json
{
  "message": "We have sent a confirmation code to your email address. Please confirm your email within 15 minutes to complete your registration."
}
```

**Errors:** `400` — validation error or email already taken.

---

### POST `/auth/confirm`

Verifies the confirmation code and creates the user in the database.

**Request body:**

```json
{
  "email":             "john@example.com",
  "confirmation_code": "a1b2c3"
}
```

| Field | Type | Constraints |
|-------|------|-------------|
| `email` | string | valid email |
| `confirmation_code` | string | exactly 6 characters |

**Response `201`:**
```json
{ "message": "You successfully registered" }
```

**Errors:** `400` — code is wrong or has expired.

---

### POST `/auth/login`

Authenticates the user. Returns an access token in the body and sets `refreshToken` / `sessionId` as httpOnly cookies.

**Request body:**

```json
{
  "email":       "john@example.com",
  "password":    "Secret42",
  "fingerprint": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `email` | string | User email |
| `password` | string | User password |
| `fingerprint` | UUID | Unique device/browser identifier |

**Response `200`:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "username": "johndoe",
    "role": "user",
    "avatar_url": null,
    "bio": null,
    "is_verified": false,
    "is_online": false,
    "last_seen": null,
    "birth_date": "1995-06-15T00:00:00.000Z",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Cookies set:**

| Cookie | httpOnly | Secure | SameSite | Max-Age |
|--------|:--------:|:------:|:--------:|---------|
| `refreshToken` | ✓ | prod only | `lax` | 30 days |
| `sessionId` | ✓ | prod only | `lax` | 30 days |

**Errors:** `400` — user not found or wrong password.

---

### POST `/auth/refresh`

Issues new tokens using the refresh token from cookies. On any security violation (token reuse, fingerprint mismatch), **all** sessions for the user are revoked.

**Request body:**

```json
{
  "userId":      1,
  "fingerprint": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Required cookies:** `refreshToken`, `sessionId`

**Response `200`:**
```json
{ "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

New `refreshToken` and `sessionId` cookies are set in the response.

**Errors:**
- `400` — invalid refresh token or missing cookies
- `401` — session has exceeded its absolute expiry (60 days from creation)

---

### POST `/auth/logout`

Removes the session from Redis and clears cookies.

**Request body:**

```json
{
  "userId":    1,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response `200`:** empty body.

---

### GET `/auth/validate`

Validates an access token. Intended to be called by nginx / API gateway as a subrequest before proxying to internal services.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response `200`:**
```
(empty body)
X-User-Id: 1
```

**Errors:** `401` — no token. `403` — token invalid or expired.

---

### POST `/auth/oauth/initiate/google` and `/auth/oauth/initiate/github`

Starts the OAuth 2.0 flow. Generates a signed `state` and redirects the client to the provider's authorization page.

**Request body:**

```json
{
  "fingerprint": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `fingerprint` | UUID | Unique device/browser identifier — embedded in state, used to bind the resulting session |

**Response:** `307 Temporary Redirect` — Location header points to the provider OAuth URL with `state` query param.

**Errors:** `400` — missing or invalid fingerprint.

---

### GET `/auth/oauth/callback/google`

Handles the redirect from Google after user consent.

**Query params (set by Google):**

| Param | Description |
|-------|-------------|
| `code` | Authorization code to exchange for tokens |
| `state` | Signed state blob generated during initiate |

**State validation:**
1. Decodes `base64url` → `{ nonce, hmac, fingerprint, iat }`.
2. Verifies HMAC-SHA256 signature (constant-time comparison).
3. Rejects if older than 10 minutes.

**On success:** exchanges `code` for Google tokens, extracts user info from `id_token` JWT, upserts the user in the database, creates a session.

**Response `200`:**
```json
{ "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

Cookies `refreshToken` and `sessionId` are also set (same as `/auth/login`).

**Errors:** `400` — invalid/missing code or state, expired state, invalid signature. `502` — Google token exchange failed.

---

### GET `/auth/oauth/callback/github`

Handles the redirect from GitHub after user consent. Identical flow to the Google callback with provider-specific differences:
- Tokens are fetched from `https://github.com/login/oauth/access_token`.
- User info is fetched from `https://api.github.com/user`.
- If email is not public, a secondary request to `https://api.github.com/user/emails` retrieves the primary verified email.

**Response `200`:**
```json
{ "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

**Errors:** same as Google callback.

---

### GET `/auth/me`

Returns the profile of the currently authenticated user. Requires `req.userId` to be set by an upstream auth middleware.

**Response `200`:**
```json
{
  "user": {
    "id": 1,
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "username": "johndoe",
    "role": "user",
    "avatar_url": null,
    "bio": null,
    "is_verified": false,
    "is_online": false,
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Errors:** `401` — `userId` not present on request.

---

## Users — `/api/v1/users`

### POST `/users/list`

Returns all registered users.

**Request body:** none.

**Response `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "username": "johndoe",
      "role": "user",
      "is_verified": false,
      "is_online": false,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

> **Note:** This endpoint is currently unprotected. Authorization middleware should be added before exposing it in production.

---

## Error Format

All errors share the same structure:

```json
{ "error": "Human-readable description" }
```

### HTTP Status Codes

| Code | When |
|------|------|
| `400` | Validation failure, wrong credentials, expired confirmation code |
| `401` | Missing token or userId |
| `403` | Invalid or expired token |
| `500` | Unhandled server error |

### Validation Error Example

```json
{
  "error": "\"email\" must be a valid email, \"password\" length must be at least 8 characters long"
}
```
