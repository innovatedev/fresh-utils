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

> **Note**: Running with `-y` defaults to the **Kvdex Production** preset
> (Structured KV + Argon2).

This will:

1. Ask you to choose a store (Memory, KV, or Kvdex).
2. Add the dependency to your `deno.json`.
3. Create `config/session.ts` and auth route templates.
4. Patch your `main.ts`.
5. Create login/logout/register routes.

## Manual Usage

### 1. Configure Session

```typescript
// config/session.ts
import {
  createSessionMiddleware,
  type SessionOptions,
} from "@innovatedev/fresh-session";
import { DenoKvSessionStorage } from "@innovatedev/fresh-session/kv-store";
// Assuming you have a State interface defined
import type { State } from "../utils.ts";

export const sessionConfig: SessionOptions = {
  // Automatically opens KV and defaults to "session" prefix
  store: new DenoKvSessionStorage({
    expireAfter: 60 * 60 * 24 * 7, // 1 week
    // Enable optional built-in user resolution:
    // userKeyPrefix: ["users"],
  }),
  cookie: {
    name: "sessionId",
    sameSite: "Lax",
    secure: true,
  },
  // Security options:
  trackUserAgent: true, // Validate UA on every request
  trackIp: true, // Track IP (uses remoteAddr)
  // trackIp: { header: "X-Forwarded-For" }, // Trust proxy header
};

// Generics provide type safety for your AppState
export const session = createSessionMiddleware<State>(sessionConfig);
```

### 2. Using Kvdex (Recommended)

`kvdex` offers a structured, typed schema on top of Deno KV.

Run:

```bash
deno add jsr:@olli/kvdex
```

```typescript
import { collection, kvdex, type KvValue, model } from "@olli/kvdex";
import {
  KvDexSessionStorage,
  type SessionDoc,
} from "@innovatedev/fresh-session/kvdex-store";
import { createSessionMiddleware } from "@innovatedev/fresh-session";

const kv = await Deno.openKv();

// Define session data model
export type SessionData = KvValue;
const SessionModel = model<SessionDoc<SessionData>>();
// User model with secondary index
const UserModel = model<{ username: string; email: string }>();

const db = kvdex({
  kv,
  schema: {
    sessions: collection(SessionModel),
    users: collection(UserModel, { indices: { email: "secondary" } }),
  },
});

export const session = createSessionMiddleware({
  store: new KvDexSessionStorage({
    collection: db.sessions,
    userCollection: db.users,
    // Optional: Use a secondary index for user resolution
    // userIndex: "email",
  }),
});
```

### 2. Register in `main.ts`

```typescript
import { session } from "./config/session.ts";

// ...
app.use(session);
// ...
```

### 3. Use in Handlers/Pages

```typescript
export const handler = define.handlers({
  async GET(ctx) {
    // Session data is fully typed (assuming State is generic)
    ctx.state.session.set("foo", "bar");

    // Flash messages (one-time messages)
    ctx.state.flash("success", "Operation successful!");

    // User login (sets session user ID and rotates session)
    await ctx.state.login("user_123");

    return ctx.render();
  },
});
```

### 4. Stateless API Tokens

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
