# @innovatedev-fresh/session

A flexible, secure session middleware for [Deno Fresh](https://fresh.deno.dev/)
(v2+).

## Features

- **Store Agnostic**: Comes with `MemorySessionStorage` and
  `DenoKvSessionStorage`.
- **Secure Defaults**: HTTP-only, secure cookies, session ID rotation.
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
