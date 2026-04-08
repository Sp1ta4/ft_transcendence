# ft_transcendence — Frontend Documentation

## Overview

React SPA frontend for a social network platform. Communicates with the backend over REST (`/api`) and WebSocket (Socket.io).

**Stack:** Vite, React 18, TypeScript, Tailwind CSS v4, shadcn/ui, React Router v7, TanStack Query v5, Axios, Zustand, React Hook Form, Zod, i18next, Socket.io-client

> This is a social media platform. There is no game module.

---

## Project Structure

```
frontend/
├── public/
├── src/
│   ├── api/
│   │   └── client.ts          # Axios instance
│   ├── components/
│   │   ├── ui/                # shadcn/ui auto-generated components
│   │   ├── layout/            # Shell, Navbar, Sidebar, etc.
│   │   └── shared/            # Reusable cross-feature components
│   ├── hooks/
│   │   └── useSocket.ts       # Socket.io connection hook
│   ├── lib/
│   │   ├── i18n.ts            # i18next initialisation
│   │   └── utils.ts           # shadcn cn() helper
│   ├── locales/
│   │   ├── en/                # English translations
│   │   └── ru/                # Russian translations
│   ├── pages/                 # Route-level page components
│   ├── stores/
│   │   └── authStore.ts       # Zustand auth store
│   ├── types/                 # Shared TypeScript types
│   ├── App.tsx                # Route definitions
│   ├── main.tsx               # App entry point, providers
│   └── index.css              # Tailwind + shadcn CSS variables
├── components.json            # shadcn/ui config
├── vite.config.ts
├── tsconfig.app.json
└── tsconfig.json
```

---

## Getting Started

### Local development

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

API calls to `/api` are proxied to `http://localhost:8080` (nginx), so the backend stack must be running:

```bash
# from project root
docker compose up --build
```

### Docker

The frontend uses a multi-stage Docker build:

1. **Builder stage** — `node:20-alpine` installs dependencies and runs `npm run build`.
2. **Serve stage** — `nginx:alpine` serves the `dist/` output as static files.

The container exposes port `80` internally. The main nginx routes all non-API traffic to it.

```
browser → nginx:80  → 301 redirect → https://
browser → nginx:443 → /api/*        → backend:3000   (HTTP internally)
                      /socket.io/*  → backend:3000   (WebSocket)
                      /*            → frontend:80    (static SPA)
```

SSL is terminated at nginx. Internal Docker network communication stays on plain HTTP. Self-signed certificates are generated during the nginx Docker image build via `openssl`. The `Strict-Transport-Security` header is set on all responses.

SPA routing is handled inside the frontend nginx config (`frontend/nginx.conf`) via `try_files $uri /index.html`.

### Build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

---

## Path Alias

`@/` maps to `src/`. Use it everywhere instead of relative paths:

```ts
import { useAuthStore } from '@/stores/authStore'
import apiClient from '@/api/client'
```

---

## Routing

Routes are defined in `src/App.tsx` using React Router v7. Protected routes redirect unauthenticated users to `/login` based on `useAuthStore`.

```
/           Home feed      (protected)
/login      Login page
/register   Registration
/confirm    Email confirmation
/profile/:id  User profile  (protected)
/friends    Friends list   (protected)
/settings   Settings       (protected)
```

When adding a new route, create a matching file under `src/pages/` and import it in `App.tsx`.

---

## API Client

`src/api/client.ts` exports a pre-configured Axios instance:

- `baseURL` — `/api`
- `withCredentials: true` — sends HTTP-only cookies on every request
- Response interceptor — redirects to `/login` on `401`

```ts
import apiClient from '@/api/client'

const { data } = await apiClient.get('/v1/users/me')
await apiClient.post('/v1/auth/logout', { userId, sessionId })
```

Group related API calls in `src/api/` by domain (e.g. `src/api/auth.ts`, `src/api/users.ts`).

---

## Server State — TanStack Query

`QueryClient` is initialised in `main.tsx` with:

- `staleTime` — 5 minutes
- `retry` — 1

Use `useQuery` / `useMutation` for all server data. Keep query key factories co-located with the API functions:

```ts
export const userKeys = {
  all: ['users'] as const,
  detail: (id: number) => ['users', id] as const,
}

export function useUser(id: number) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => apiClient.get(`/v1/users/${id}`).then(r => r.data),
  })
}
```

---

## Global State — Zustand

Only truly global, client-side state goes into Zustand stores. Server data belongs in TanStack Query.

**`src/stores/authStore.ts`** — persisted to `localStorage` under key `auth-storage`.

| Field | Type | Description |
|---|---|---|
| `user` | `User \| null` | Currently authenticated user |
| `isAuthenticated` | `boolean` | Derived from `user` |
| `setUser(user)` | action | Set user after login/register |
| `logout()` | action | Clear auth state |

```ts
const { user, isAuthenticated, setUser, logout } = useAuthStore()
```

---

## UI Components — shadcn/ui

shadcn components live in `src/components/ui/` and are added via the CLI:

```bash
npx shadcn@latest add button
npx shadcn@latest add input dialog card avatar
```

Do not edit files inside `src/components/ui/` directly — re-run the CLI to update them. Custom components go into `src/components/layout/` or `src/components/shared/`.

---

## Internationalisation

Supported languages: **English** (`en`), **Russian** (`ru`).

The active language is read from `localStorage` key `lang` on startup. Default is `en`.

### Namespaces

| Namespace | File | Contents |
|---|---|---|
| `common` | `common.json` | Generic labels, actions, error messages |
| `auth` | `auth.json` | Login, register, confirm, validation |
| `nav` | `nav.json` | Navigation links |
| `profile` | `profile.json` | Profile page and stats |
| `friends` | `friends.json` | Friends list and actions |

### Usage

```tsx
import { useTranslation } from 'react-i18next'

function LoginPage() {
  const { t } = useTranslation('auth')
  return <h1>{t('login.title')}</h1>
}
```

For the default `common` namespace, `t('actions.save')` works without specifying the namespace.

### Switching language

```ts
import i18n from '@/lib/i18n'

function switchLanguage(lang: 'en' | 'ru') {
  i18n.changeLanguage(lang)
  localStorage.setItem('lang', lang)
}
```

### Adding a new namespace

1. Create `src/locales/en/<namespace>.json` and `src/locales/ru/<namespace>.json`.
2. Import both files in `src/lib/i18n.ts` and add them to the `resources` object.

---

## WebSocket — Socket.io

Used for real-time features: **chat** and **notifications**.

`src/hooks/useSocket.ts` returns a connected `Socket` instance when the user is authenticated, and `null` otherwise. The connection is torn down on logout or component unmount.

```tsx
function ChatWindow() {
  const socket = useSocket('/chat')

  useEffect(() => {
    if (!socket) return
    socket.on('message:new', (msg) => { /* ... */ })
    return () => { socket.off('message:new') }
  }, [socket])
}

function NotificationBell() {
  const socket = useSocket('/notifications')

  useEffect(() => {
    if (!socket) return
    socket.on('notification', (n) => { /* ... */ })
    return () => { socket.off('notification') }
  }, [socket])
}
```

Namespaces: `/chat`, `/notifications`. Pass the namespace as the first argument to `useSocket` (default: `/`).

---

## Styling

Tailwind CSS v4 is configured via the `@tailwindcss/vite` plugin — no `tailwind.config.js` needed. Theme tokens (colors, radius, fonts) are defined as CSS variables in `src/index.css` and mapped to Tailwind utilities under `@theme inline`.

Dark mode is toggled by adding the `.dark` class to `<html>`.

```tsx
document.documentElement.classList.toggle('dark')
```

Use semantic color tokens (e.g. `bg-background`, `text-foreground`, `border-border`) rather than raw palette values so dark mode works automatically.

---

## Environment Variables

Vite exposes only variables prefixed with `VITE_`. Create a `.env.local` file in the `frontend/` directory for local overrides — it is gitignored.

| Variable | Default | Description |
|---|---|---|
| `VITE_APP_NAME` | `ft_transcendence` | Application name |

The `/api` proxy is hardcoded in `vite.config.ts` for development. In production, nginx serves the built `dist/` and proxies `/api` itself.

---

## NPM Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |
