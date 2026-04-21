# Database

PostgreSQL accessed via **Prisma 7** with the `@prisma/adapter-pg` driver adapter.

The schema is split across multiple files in `prisma/schema/`. The generated client is output to `src/generated/prisma/` (run `npm run generate` to create it).

---

## Configuration

**`prisma/schema/schema.prisma`** — datasource and generator:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

**`prisma.config.ts`** — points Prisma CLI to the multi-file schema:

```typescript
export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] },
});
```

---

## Models

### User

Central entity. All other models relate back to `users`.

```prisma
model User {
  id            Int       @id @default(autoincrement())
  first_name    String
  last_name     String
  email         String    @unique
  username      String    @unique
  password_hash String?   // NULL for OAuth-only accounts
  role          String    @default("user")  // "user" | "admin"
  avatar_url    String?
  bio           String?
  is_verified   Boolean   @default(false)
  is_online     Boolean   @default(false)
  last_seen     DateTime? @db.Timestamptz
  birth_date    DateTime? @db.Date
  created_at    DateTime  @default(now()) @db.Timestamptz
  updated_at    DateTime? @db.Timestamptz
  deleted_at    DateTime? @db.Timestamptz  // soft-delete

  oauth_accounts             OAuthAccount[]
  posts                      Post[]
  post_likes                 PostLike[]
  comment_likes              CommentLike[]
  comments                   Comment[]
  following                  Follow[]                  @relation("follower")
  followers                  Follow[]                  @relation("following")
  conversation_participants  ConversationParticipant[]
  sent_messages              Message[]
  notifications_received     Notification[]            @relation("notif_receiver")
  notifications_sent         Notification[]            @relation("notif_actor")

  @@map("users")
}
```

**Key fields:**
- `password_hash` — nullable; `NULL` means the account was created via OAuth.
- `deleted_at` — soft-delete pattern; records are never hard-deleted.
- `role` — stored as a plain string; validate at the application layer.

---

### OAuthAccount

Stores third-party provider credentials linked to a user.

```prisma
model OAuthAccount {
  id               Int     @id @default(autoincrement())
  user_id          Int
  provider         String  // "github" | "google"
  provider_user_id String
  access_token     String?

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([provider, provider_user_id])
  @@map("oauth_accounts")
}
```

One user can have multiple OAuth accounts (e.g., both GitHub and Google).

---

### Follow

Self-referential many-to-many relationship on `User`.

```prisma
model Follow {
  follower_id  Int
  following_id Int
  created_at   DateTime @default(now()) @db.Timestamptz

  follower  User @relation("follower",  fields: [follower_id],  references: [id], onDelete: Cascade)
  following User @relation("following", fields: [following_id], references: [id], onDelete: Cascade)

  @@id([follower_id, following_id])
  @@map("follows")
}
```

- `follower_id` — the user who follows.
- `following_id` — the user being followed.

---

### Post / PostMedia / PostLike

```prisma
model Post {
  id         Int       @id @default(autoincrement())
  user_id    Int
  content    String
  created_at DateTime  @default(now()) @db.Timestamptz
  updated_at DateTime? @db.Timestamptz
  deleted_at DateTime? @db.Timestamptz

  author   User        @relation(fields: [user_id], references: [id], onDelete: Cascade)
  media    PostMedia[]
  likes    PostLike[]
  comments Comment[]

  @@map("posts")
}

model PostMedia {
  id         Int      @id @default(autoincrement())
  post_id    Int
  url        String
  type       String   // "image" | "video"
  order_num  Int      @default(0)
  created_at DateTime @default(now()) @db.Timestamptz

  post Post @relation(fields: [post_id], references: [id], onDelete: Cascade)

  @@map("post_media")
}

model PostLike {
  user_id    Int
  post_id    Int
  created_at DateTime @default(now()) @db.Timestamptz

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)
  post Post @relation(fields: [post_id], references: [id], onDelete: Cascade)

  @@id([user_id, post_id])
  @@map("post_likes")
}
```

---

### Comment / CommentLike

Supports nested replies via `parent_id`.

```prisma
model Comment {
  id         Int       @id @default(autoincrement())
  post_id    Int
  user_id    Int
  parent_id  Int?      // NULL = top-level comment; non-NULL = reply
  content    String
  created_at DateTime  @default(now()) @db.Timestamptz
  deleted_at DateTime? @db.Timestamptz

  post    Post          @relation(fields: [post_id],   references: [id], onDelete: Cascade)
  user    User          @relation(fields: [user_id],   references: [id], onDelete: Cascade)
  parent  Comment?      @relation("replies", fields: [parent_id], references: [id])
  replies Comment[]     @relation("replies")
  likes   CommentLike[]

  @@map("comments")
}

model CommentLike {
  user_id    Int
  comment_id Int
  created_at DateTime @default(now()) @db.Timestamptz

  user    User    @relation(fields: [user_id],    references: [id], onDelete: Cascade)
  comment Comment @relation(fields: [comment_id], references: [id], onDelete: Cascade)

  @@id([user_id, comment_id])
  @@map("comment_likes")
}
```

---

### Conversation / ConversationParticipant / Message / MessageMedia

Direct messaging between users.

```prisma
model Conversation {
  id         Int      @id @default(autoincrement())
  created_at DateTime @default(now()) @db.Timestamptz

  participants ConversationParticipant[]
  messages     Message[]

  @@map("conversations")
}

model ConversationParticipant {
  conversation_id Int
  user_id         Int
  last_read_at    DateTime? @db.Timestamptz

  conversation Conversation @relation(fields: [conversation_id], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [user_id],         references: [id], onDelete: Cascade)

  @@id([conversation_id, user_id])
  @@map("conversation_participants")
}

model Message {
  id              Int       @id @default(autoincrement())
  conversation_id Int
  sender_id       Int
  content         String?   // NULL when the message contains only media
  created_at      DateTime  @default(now()) @db.Timestamptz
  deleted_at      DateTime? @db.Timestamptz

  conversation Conversation  @relation(fields: [conversation_id], references: [id], onDelete: Cascade)
  sender       User          @relation(fields: [sender_id],       references: [id], onDelete: Cascade)
  media        MessageMedia[]

  @@map("messages")
}

model MessageMedia {
  id         Int      @id @default(autoincrement())
  message_id Int
  url        String
  type       String   // "image" | "video"
  created_at DateTime @default(now()) @db.Timestamptz

  message Message @relation(fields: [message_id], references: [id], onDelete: Cascade)

  @@map("message_media")
}
```

---

### Notification

Unified notification model covering all event types.

```prisma
model Notification {
  id         Int      @id @default(autoincrement())
  user_id    Int      // recipient
  actor_id   Int      // who triggered the event
  type       String   // "like" | "comment" | "follow" | "message" | "reply"
  entity_id  Int?     // id of the related post / comment / message
  is_read    Boolean  @default(false)
  created_at DateTime @default(now()) @db.Timestamptz

  user  User @relation("notif_receiver", fields: [user_id],  references: [id], onDelete: Cascade)
  actor User @relation("notif_actor",    fields: [actor_id], references: [id], onDelete: Cascade)

  @@map("notifications")
}
```

---

## Entity Relationship Overview

```
User ──< OAuthAccount
User ──< Follow (as follower)
User ──< Follow (as following)
User ──< Post ──< PostMedia
              ──< PostLike
              ──< Comment ──< CommentLike
                          ──< Comment (replies)
User ──< ConversationParticipant >── Conversation ──< Message ──< MessageMedia
User ──< Notification (received)
User ──< Notification (sent/actor)
```

---

## Migrations

```bash
# Create a new migration from schema changes
npm run migrate:make add_user_bio

# Apply all pending migrations (CI / production)
npm run migrate

# Reset database (destroys all data!)
npm run migrate:reset
```

Migration files are stored in `prisma/migrations/` and should be committed to version control.
