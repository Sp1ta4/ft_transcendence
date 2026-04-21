# Backend — ft_transcendence

Express + TypeScript backend. ESM modules (`"type": "module"`), Prisma ORM (PostgreSQL), Redis для сессий и подтверждения email.

## Команды

```bash
npm run dev          # nodemon + tsx (разработка)
npm run build        # tsc --build
npm run start        # node ./dist/main.js (production)
npm run generate     # prisma generate
npm run migrate      # prisma migrate deploy (production)
npm run migrate:dev  # prisma migrate dev
npm run migrate:make -- <name>  # создать новую миграцию
npm run studio       # Prisma Studio
```

## Структура

```
src/
  app.ts                  # Express app (middleware, роутеры)
  main.ts                 # bootstrap: проверка подключений, старт сервера
  container.ts            # DI-контейнер (создаёт репозитории, сервисы, контроллеры)
  constants/              # error_messages, success_messages, users (TTL, провайдеры)
  middlewares/
    authAccess.ts         # JWT middleware — кладёт userId в res.locals
    errorHandler.ts       # глобальный обработчик ошибок
  modules/
    auth/
      auth.controller.ts  # HTTP-хендлеры
      auth.service.ts     # бизнес-логика, OAuth-методы
      auth.repository.ts  # работа с Redis (сессии)
      utils.ts            # OAuthStrategy (Google, GitHub)
    users/
      users.controller.ts
      users.service.ts
      users.repository.ts # работа с Prisma (User, OAuthAccount)
  routes/
    auth.router.ts
    users.router.ts
    index.ts
  resources/
    prisma.ts             # PrismaClient singleton
    redis.ts              # Redis client singleton
  types/
    User/IAuthorization.ts
  utils/
    error/HttpError.ts
    error/DataValidationError.ts
    jwt.ts                # signAccess / verifyAccess
    hash.ts               # randomLong, sha256Hex
    passwordUtils.ts      # hashPassword, comparePassword (bcrypt)
    validateSchema.ts     # Joi-обёртка, бросает DataValidationError
    checkEmailUnique.ts
  generated/prisma/       # авто-генерация Prisma (не редактировать)
```

## Auth API

Все роуты под префиксом `/auth`.

### Классическая авторизация

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/register` | Создаёт запись в Redis, отправляет код подтверждения (TTL 15 мин) |
| POST | `/confirm` | Проверяет код, создаёт пользователя в БД |
| POST | `/login` | Логин по email+password+fingerprint, возвращает accessToken, устанавливает httpOnly cookies (refreshToken, sessionId) |
| POST | `/refresh` | Ротация refresh-токена (fingerprint + cookie валидация) |
| POST | `/logout` | Удаляет сессию из Redis, чистит cookies |
| GET | `/validate` | Проверяет Bearer access-токен, отдаёт `X-User-Id` заголовок |
| GET | `/me` | Возвращает текущего пользователя (требует authAccess middleware) |

### OAuth 2.0 (Google и GitHub)

#### Поддерживаемые провайдеры
- `google` — константа `GOOGLE_OAUTH_PROVIDER`
- `github` — константа `GITHUB_OAUTH_PROVIDER`

#### Роуты

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/oauth/initiate/google` | Генерирует state, редиректит на Google OAuth |
| GET | `/oauth/callback/google` | Обменивает code на токены, создаёт/обновляет пользователя |
| POST | `/oauth/initiate/github` | Генерирует state, редиректит на GitHub OAuth |
| GET | `/oauth/callback/github` | Обменивает code на токены, создаёт/обновляет пользователя |

#### OAuth Flow

1. **Initiate** (`POST /oauth/initiate/:provider`):
   - Принимает `{ fingerprint: uuid }`
   - Генерирует CSRF-защищённый `state`: `base64url({ nonce, hmac(nonce, ACCESS_SECRET), fingerprint, iat })`
   - Редиректит (307) на OAuth-провайдера

2. **Callback** (`GET /oauth/callback/:provider`):
   - Валидирует `state`: HMAC подпись + TTL 10 минут
   - Обменивает `code` на токены провайдера
   - Получает данные пользователя (email, name, avatar, providerUserId)
   - `upsertUserFromOAuth` — создаёт нового пользователя или обновляет avatar существующего
   - Создаёт новую сессию, возвращает `accessToken` + cookies

#### Стратегии (Strategy Pattern)

`src/modules/auth/utils.ts` — `GoogleOAuthStrategy`, `GitHubOAuthStrategy`:
- Google: scope `openid email profile`, endpoint `accounts.google.com/o/oauth2/v2/auth`
- GitHub: scope `read:user user:email`, endpoint `github.com/login/oauth/authorize`; email получается отдельным запросом к `/user/emails` если не указан в профиле

#### Модель OAuthAccount (Prisma)

```
OAuthAccount {
  id               Int
  user_id          Int
  provider         String         // "google" | "github"
  provider_user_id String
  access_token     String?
}
// unique: (provider, provider_user_id)
```

Пользователь создаётся без пароля (`password_hash = null`). Username генерируется из email с суффиксом `_N` при коллизии.

### 2FA (TOTP)

Роуты требуют Bearer-токен (`authAccess` middleware).

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/2fa/setup` | Генерирует TOTP-секрет, сохраняет в Redis (TTL 5 мин), возвращает QR-код |
| POST | `/2fa/enable` | Проверяет TOTP-код, записывает секрет в БД, включает 2FA |
| DELETE | `/2fa/disable` | Обнуляет секрет в БД, выключает 2FA |

#### 2FA Flow

1. **Setup** (`GET /2fa/setup`):
   - Генерирует TOTP-секрет через `otplib.generateSecret()`
   - Сохраняет в Redis: `user:{userId}:temp-2fa-secret`, TTL 5 минут
   - Возвращает `{ qrCode: string }` — base64 data URL PNG (issuer: `"Transcendence"`, label: email пользователя)

2. **Enable** (`POST /2fa/enable`):
   - Body: `{ code: string }` — 6-значный TOTP-код из приложения-аутентификатора
   - Читает временный секрет из Redis; если отсутствует — `410 Gone` ("No 2FA setup in progress")
   - Верифицирует код через `otplib.verifySync`; если неверный — `400 Bad Request`
   - При успехе: записывает `two_factor_secret` и `two_factor_enabled: true` в БД, удаляет Redis-ключ
   - Ответ: `{ message: "2FA enabled successfully" }`

3. **Disable** (`DELETE /2fa/disable`):
   - Записывает `two_factor_secret: ''` и `two_factor_enabled: false` в БД
   - Ответ: `{ message: "2FA disabled successfully" }`

#### Схема User (поля 2FA)

```
two_factor_secret  String?   // NULL пока 2FA не включена
two_factor_enabled Boolean   @default(false)
```

#### Redis-ключи 2FA

| Ключ | TTL | Описание |
|------|-----|----------|
| `user:{userId}:temp-2fa-secret` | 5 мин | Временный TOTP-секрет до подтверждения |

#### Зависимости

- `otplib` — генерация и верификация TOTP
- `qrcode` — генерация QR-кода в data URL

## Сессии

- Хранятся в Redis
- Ключ сессии: `session:{userId}:{sessionId}`
- Данные: `{ tokenHash, fingerprint, createdAt, absoluteExpireAt }`
- `absoluteExpireAt` = 60 дней
- Максимум `MAX_DEVICES = 3` активных сессий; при превышении удаляется самая старая
- При несовпадении fingerprint или token hash — удаляются **все** сессии пользователя

## Переменные окружения

```env
PORT=
NODE_ENV=

DATABASE_URL=

REDIS_URL=

ACCESS_SECRET=          # JWT + HMAC для OAuth state

GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=

PROVIDER_OAUTH_REDIRECT_URI=   # base URL, к нему добавляется /google или /github
```

## Важные детали

- Импорты с `.js` расширением (ESM)
- `validateSchema<T>(body, schema)` бросает `DataValidationError` при ошибке валидации
- `HttpError(statusCode, message)` для HTTP-ошибок
- Access-токен живёт `ACCESS_TTL = 5184000` сек (60 дней) — хранится в `src/constants/users.ts`
- Confirmation code TTL: 15 минут, Redis-ключ: `email_confirmation_code:{email}`
