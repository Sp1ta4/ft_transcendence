# Architecture

## Request Lifecycle

```
HTTP Request
      │
      ▼
  Middleware
  morgan · cors · express.json · cookieParser
      │
      ▼
   Router
  /api/v1/auth   →  authRouter
  /api/v1/users  →  usersRouter
      │
      ▼
  Controller
  Validate input (Joi) → call service
      │
      ▼
   Service
  Business logic, token/session management
      │
      ▼
  Repository
  Prisma (PostgreSQL) · Redis
      │
      ▼
  Response
      ▲
  errorHandler
  Catches all errors passed via next(err)
```

### Layer Responsibilities

| Layer | Knows about | Does NOT know about |
|-------|-------------|---------------------|
| **Controller** | HTTP: req, res, cookies, headers | Business rules |
| **Service** | Business logic, error conditions | HTTP, cookies |
| **Repository** | Data storage (Prisma / Redis) | Business logic |

---

## Dependency Injection Container

All instances are created once at startup in `src/container.ts`.

```
prisma ──┐
         ├── usersRepository ──── usersService ──── usersController
redis  ──┘
         │
         └── authRepository ──┐
                               ├── authService ──── authController
             usersRepository ──┘
```

```typescript
// src/container.ts (simplified)
const usersRepository = new UsersRepository(prisma, redis);
const usersService    = new UsersService(usersRepository);
const usersController = new UsersController(usersService);

const authRepository  = new AuthRepository(prisma, redis);
const authService     = new AuthService(authRepository, usersRepository);
const authController  = new AuthController(authService);
```

> `authService` depends on `usersRepository` directly to look up users during
> login/confirm — avoiding a cross-service dependency on `usersService`.

---

## Error Handling

### Error Class Hierarchy

```
Error  (built-in)
  └── HttpError             status: number, message: string
        └── DataValidationError   status: 400, Joi messages joined
```

### Error Flow

```
Controller
  └── try / catch
        └── next(err)
              └── errorHandler middleware
                    └── res.status(err.status ?? 500).json({ error: err.message })
```

### Error Codes by Scenario

| Scenario | Class | HTTP Status |
|----------|-------|:-----------:|
| Joi schema fails | `DataValidationError` | 400 |
| Email already taken | `DataValidationError` | 400 |
| Wrong confirmation code | `HttpError` | 400 |
| Invalid email or password | `HttpError` | 400 |
| Invalid / missing refresh token | `HttpError` | 400 |
| Session expired (> 60 days) | `HttpError` | 401 |
| Invalid access token | direct response | 403 |
| User creation failed | `HttpError` | 500 |

---

## Input Validation

Every controller endpoint uses the generic helper `validateSchema<T>(data, joiSchema)`.

```typescript
const payload = validateSchema<LoginBody>(req.body, Joi.object({
  email:       Joi.string().email().required(),
  password:    Joi.string().min(8).max(64).required(),
  fingerprint: Joi.string().uuid().required(),
}));
```

- `abortEarly: false` — collects **all** validation errors at once.
- On failure throws `DataValidationError` with all Joi messages joined by `, `.
- The generic parameter `T` ensures the returned value is typed.

---

## Express App Composition

```
app.ts
├── morgan('dev')                     # Request logging
├── express.json()                    # JSON body parser
├── cors()                            # CORS headers
├── express.urlencoded({ extended })  # URL-encoded body
├── cookieParser()                    # Cookie parsing
│
├── /  →  indexRouter
│          ├── /api/v1/auth   →  authRouter
│          └── /api/v1/users  →  usersRouter
│
└── errorHandler(err, req, res, next) # 4-arg Express error handler
```

---

## TypeScript Configuration

| Option | Value | Effect |
|--------|-------|--------|
| `module` | `nodenext` | ESM with Node.js resolution; imports require `.js` extension |
| `strict` | `true` | Enables `strictNullChecks`, `noImplicitAny`, strict function types |
| `verbatimModuleSyntax` | `true` | `import type` required for type-only imports |
| `noUnusedLocals/Params` | `true` | Compiler error on unused variables / parameters |
| `moduleDetection` | `force` | Every file is treated as a module |
