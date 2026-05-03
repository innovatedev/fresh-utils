# @innovatedev/fresh-session

A flexible, secure session middleware for [Deno Fresh](https://fresh.deno.dev/)
(v2+).

## AI Transparency

⚠️ This project is primarily AI-assisted (Antigravity, Copilot, Cursor, Gemini,
ChatGPT, Composer, Claude, Grok); all code is directed, reviewed, and tested by
humans.

## Features

- [Changelog](https://github.com/innovatedev/fresh-utils/blob/main/session/CHANGELOG.md)
- **Store Agnostic**: Comes with `MemorySessionStorage`, `DenoKvSessionStorage`,
  and `KvDexSessionStorage`.
- **Atomic Concurrency**: Built-in Optimistic Locking to prevent data loss
  during concurrent requests.
- **Lifecycle Events**: Hook into `create`, `refresh`, `destroy`, `rotate`, and
  `expired` events.
- **Flash Messages**: Simple temporary data persistence for redirects.
- **Fresh 2.0 Native**: Built-in `createDefineSession` helper for
  zero-boilerplate setup.
- **Secure Defaults**: HTTP-only, secure cookies, 128-bit session IDs.
- **Session Security**: Optional User-Agent validation and IP tracking.
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

This will automatically configure your storage, patch your `utils.ts`, and
generate login/logout routes.

## Manual Usage

### 1. Configure Session

```typescript
// config/session.ts
import { createSessionMiddleware } from "@innovatedev/fresh-session";
import { DenoKvSessionStorage } from "@innovatedev/fresh-session/kv-store";
import type { State } from "../utils.ts";

export const session = createSessionMiddleware<State>({
  store: new DenoKvSessionStorage(),
  cookie: { name: "sessionId", sameSite: "Lax", secure: true },
  expiry: 60 * 60 * 24 * 7, // 1 week idle timeout
  absoluteExpiry: 60 * 60 * 24 * 30, // 30 days absolute limit
  trackUserAgent: true,
  onEvent: (event) => {
    console.log(`[session] ${event.type}: ${event.sessionId}`);
  },
});
```

### 2. Using Kvdex (Recommended)

`kvdex` offers a structured, typed schema with secondary indexing.

```typescript
// kv/db.ts
import { collection, kvdex, model } from "@olli/kvdex";
import { sessionModel } from "@innovatedev/fresh-session/kvdex-store";

export interface User {
  username: string;
  email: string;
}

export const db = kvdex({
  kv: await Deno.openKv(),
  schema: {
    // Use sessionModel() for a library-agnostic base schema
    sessions: collection(sessionModel(), {
      indices: {
        userId: "secondary",
        createdAt: "secondary",
        lastSeenAt: "secondary",
        ua: "secondary",
        ip: "secondary",
      },
    }),
    users: collection(model<User>(), {
      indices: {
        username: "primary",
      },
    }),
  },
});
```

### 3. Usage in Handlers

```typescript
import { define } from "../utils.ts";

export const handler = define.handlers({
  GET(ctx) {
    // Access session data (ctx.state.session)
    const count = ctx.state.session.count ?? 0;
    ctx.state.session.count = count + 1;

    // Flash messages (consumed on next access)
    ctx.state.flash("success", "Profile updated!");

    return ctx.render();
  },
});
```

## Advanced Features

### Atomic Concurrency Control

Version 0.6.0 introduces **Optimistic Concurrency Control (OCC)**. When multiple
requests for the same session overlap, the middleware ensures that they don't
silently overwrite each other's changes.

If a collision is detected, a warning is logged:
`[session] Optimistic locking failure for session XYZ. Concurrent modification detected.`

### Lifecycle Events

Monitor session activity using the `onEvent` callback:

| Event Type | Triggered When                                             |
| :--------- | :--------------------------------------------------------- |
| `create`   | A brand new session is initialized and saved.              |
| `refresh`  | An existing session's `lastSeenAt` is updated (heartbeat). |
| `rotate`   | `ctx.state.login()` is called.                             |
| `destroy`  | `ctx.state.logout()` is called.                            |
| `expired`  | A session is invalidated due to idle or absolute timeout.  |

### Flash Messages

Flash messages are temporary session data that persist until they are read.
Perfect for status messages after a form submission.

```ts
// Set a flash message
ctx.state.flash("error", "Invalid credentials");

// Read in a component/page
const error = ctx.state.flash("error");
```

### Session ID Rotation

Always rotate the session ID when a user logs in to prevent Session Fixation
attacks:

```ts
export const handler = define.handlers({
  async POST(ctx) {
    const user = await authenticate(ctx.req);
    if (user) {
      await ctx.state.login(user.id);
      // Automatically rotates the ID and populates ctx.state.user
      return new Response(null, { status: 302, headers: { Location: "/" } });
    }
  },
});
```

## Security Issues

Report any security related issues to security@innovate.dev
