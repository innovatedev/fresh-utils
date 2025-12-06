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

This will:

1. Ask you to choose a store (Memory or KV).
2. Add the dependency to your `deno.json`.
3. Create `config/session.ts` and auth route templates.
4. Patch your `main.ts`.

## Manual Usage

### 1. Create Middleware

```typescript
// config/session.ts
import { createSessionMiddleware } from "@innovatedev-fresh/session";
import { DenoKvSessionStorage } from "@innovatedev-fresh/session/kv-store";

const kv = await Deno.openKv();

export const sessionMiddleware = createSessionMiddleware({
  store: new DenoKvSessionStorage(kv),
  cookie: {
    name: "sessionId",
    sameSite: "Lax",
    secure: true,
  },
});
```

### 2. Register in `main.ts`

```typescript
import { sessionMiddleware } from "./config/session.ts";

// ...
app.use(sessionMiddleware);
// ...
```

### 3. Use in Handlers/Pages

```typescript
export const handler = define.handlers({
  GET(ctx) {
    const session = ctx.state.session;
    session.foo = "bar"; // Set data
    return new Response(`Session ID: ${ctx.state.sessionId}`);
  },
});
```
