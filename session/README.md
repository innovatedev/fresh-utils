# @innovatedev/fresh-session

A flexible, secure session middleware for [Deno Fresh](https://fresh.deno.dev/)
(v2+).

## AI Transparency

⚠️ This project is primarily AI-assisted (Antigravity, Copilot, Cursor, Gemini,
ChatGPT, Composer, Claude, Grok); all code is directed, reviewed, and tested by
humans.

## Features

- **Store Agnostic**: Comes with `MemorySessionStorage`, `DenoKvSessionStorage`,
  and `KvDexSessionStorage`.
- **Secure Defaults**: HTTP-only, secure cookies, session ID rotation.
- **Session Security**: Optional User-Agent validation and IP tracking.
- **Type-Safe**: Fully typed session data.
- **CLI Init**: Easy setup tool.

## Installation

```bash
deno add jsr:@innovatedev/fresh-session
```

## Quick Start (CLI)

The easiest way to get started is using the initialization tool:

```bash
deno run -A jsr:@innovatedev/fresh-session/init
```

> **Note**: Running with defaults (e.g. via `-y` or confirming the initial
> prompt) uses the **Kvdex Production** preset (Structured KV + Argon2, no
> prefix).

This will:

1. Consolidated prompts: All configuration questions are asked up-front.
2. Preset selection: Memory, KV, or Kvdex.
3. Add dependencies: Automatically injected into `deno.json`.
4. Create config: `config/session.ts` (and `kv/db.ts` + `kv/models.ts` for
   Kvdex).
5. Update State: `utils.ts` State interface is patched to extend session State.
6. Patch Main: `main.ts` is patched with the session middleware.
7. Routes: Generated routes (`login`, `register`, `logout`) use static imports
   for better performance and DX.
8. Dependency Fixes: Automatically resets `deno.lock` and runs `deno install` to
   resolve Preact version conflicts.

## Manual Usage

### 1. Configure Session

```typescript
// config/session.ts
import {
  createSessionMiddleware,
  type SessionOptions,
} from "@innovatedev/fresh-session";
import { DenoKvSessionStorage } from "@innovatedev/fresh-session/kv-store";
import type { State } from "../utils.ts";

export const sessionConfig: SessionOptions = {
  store: new DenoKvSessionStorage(), // Defaults to Deno.openKv()
  cookie: { name: "sessionId", sameSite: "Lax", secure: true },
  trackUserAgent: true,
  trackIp: true,
};

export const session = createSessionMiddleware<State>(sessionConfig);
```

### 2. Update `utils.ts` (Type Safety)

To get full type safety in your handlers, extend the session `State` and export
`defineAuth`:

```typescript
// utils.ts
import { createDefine } from "fresh";
import type { State as SessionState } from "@innovatedev/fresh-session";

export interface User {
  username: string;
  email: string;
}

export interface State extends SessionState<User> {
  shared: string; // Your existing state
}

// Strictly typed state for authenticated routes (user is non-optional)
export type AuthState = State & { user: User; userId: string };

export const define = createDefine<State>();
export const defineAuth = createDefine<AuthState>();
```

### 3. Using Kvdex (Recommended)

`kvdex` offers a structured, typed schema with primary indices for efficient
user resolution.

```typescript
// kv/models.ts
import { type KvValue, model } from "@olli/kvdex";
import type { SessionDoc } from "@innovatedev/fresh-session/kvdex-store";

export type User = {
  username: string;
  email: string;
  passwordHash: string;
} & KvValue;

export const SessionModel = model<SessionDoc<KvValue>>();
export const UserModel = model<User>();
```

```typescript
// kv/db.ts
import { collection, kvdex } from "@olli/kvdex";
import { SessionModel, UserModel } from "./models.ts";

const kv = await Deno.openKv();

export const db = kvdex({
  kv,
  schema: {
    sessions: collection(SessionModel),
    users: collection(UserModel, {
      indices: {
        username: "primary", // Enable lookup by username
        email: "primary", // Enable lookup by email
      },
    }),
  },
});
```

```typescript
// config/session.ts
import { createSessionMiddleware } from "@innovatedev/fresh-session";
import { KvDexSessionStorage } from "@innovatedev/fresh-session/kvdex-store";
import { db } from "../kv/db.ts";

export const session = createSessionMiddleware({
  store: new KvDexSessionStorage({
    collection: db.sessions,
    userCollection: db.users, // Enables ctx.state.user resolution
  }),
});
```

### 3. Register in `main.ts`

```typescript
import { session } from "./config/session.ts";

// ...
app.use(session);
// ...
```

### 5. Use in Handlers/Pages

Use `define` for public pages and `defineAuth` for routes where the user must be
logged in. Return `page()` to render the component from a handler:

```typescript
import { page } from "fresh";
import { defineAuth } from "../utils.ts";

// For authenticated routes (ctx.state.user is non-optional)
export const handler = defineAuth.handlers({
  async GET(ctx) {
    // Session data (key-value object)
    ctx.state.session["foo"] = "bar";

    // User is guaranteed to exist here
    const user = ctx.state.user;
    const userId = ctx.state.userId;

    return page();
  },
});
```

### 5. Stateless API Tokens

You can use the same middleware to protect API routes with Bearer tokens
(Stateless).

- **Stateless**: No session is stored/persisted.
- **Unified Context**: `ctx.state.user` is populated.
- **No-op Flash**: Flash messages are disabled for API requests.

```typescript
// config/session.ts
export const session = createSessionMiddleware({
  store,
  // 1. Define how to verify the token (e.g. JWT)
  verifyToken: async (token) => {
    // Return user if valid, undefined if invalid (or throw)
    const user = await userFromToken(token);
    return user;
  },
  // 2. Optional: Customize header (Default: Authorization)
  // tokenHeader: "X-API-Key",

  // 3. Optional: Customize prefix (Default: "Bearer ")
  // Set to null to receive the raw header value
  // tokenPrefix: "Token ",
});
```

## Security features

### User Agent Tracking

Enable `trackUserAgent: true` in your configuration to store the user's browser
signature. The middleware validates this on every request. If the User-Agent
changes (e.g. session hijacking attempt), the session is immediately invalidated
and the user is logged out.

### IP Address Tracking

Enable `trackIp: true` to store the client's IP address for audit purposes.

- By default, it uses `ctx.info.remoteAddr`.
- For applications behind proxies (like load balancers), specify the header:
  ```ts
  trackIp: {
    header: "X-Forwarded-For";
  }
  ```

> **Security Warning**: Only use the `header` option if this header is
> guaranteed to be set or overridden by a trusted proxy (e.g. Cloudflare, Nginx)
> that the client cannot bypass. If the client can control this header, they can
> spoof their IP address.

Note: IP addresses are stored but **not validated** on every request. This
prevents valid users from being logged out when switching networks (e.g. WiFi to
mobile data).

## Security Issues

Report any security related issues to security@innovate.dev
