# @innovatedev-fresh/session

A flexible, secure session middleware for [Deno Fresh](https://fresh.deno.dev/)
(v2+).

## Features

- **Store Agnostic**: Comes with `MemorySessionStorage` and
  `DenoKvSessionStorage`.
- **Secure Defaults**: HTTP-only, secure cookies, session ID rotation.
- **Session Security**: Optional User-Agent validation and IP tracking.
- **Type-Safe**: Fully typed session data.
- **CLI Init**: Easy setup tool.

## Installation

```bash
deno add jsr:@innovatedev-fresh/session
```

## Quick Start (CLI)

The easiest way to get started is using the initialization tool:

```bash
deno run -A jsr:@innovatedev-fresh/session/init
```

> **Note**: Running with `-y` defaults to the **KV Production** preset (Secure
> KV Store + Argon2).

This will:

1. Ask you to choose a store (Memory or KV).
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
} from "@innovatedev-fresh/session";
import { DenoKvSessionStorage } from "@innovatedev-fresh/session/kv-store";
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
