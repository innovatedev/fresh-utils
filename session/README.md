# @innovatedev/fresh-session

[![jsr:@innovatedev/fresh-session](https://jsr.io/badges/@innovatedev/fresh-session)](https://jsr.io/@innovatedev/fresh-session)

A flexible, secure session middleware for [Deno Fresh](https://fresh.deno.dev/)
(v2+).

## AI Transparency

⚠️ AI-assisted development, human-directed and reviewed.

## Features

- [Changelog](https://github.com/innovatedev/fresh-utils/blob/main/session/CHANGELOG.md)
- **Store Agnostic**: Comes with `MemorySessionStorage`, `DenoKvSessionStorage`,
  and `KvDexSessionStorage`.
- **Atomic Concurrency**: Built-in Optimistic Locking to prevent data loss
  during concurrent requests.
- **Atomic Retry**: `session.update()` helper for conflict-free mutations with
  configurable retry strategy.
- **Lifecycle Events**: Hook into `create`, `refresh`, `destroy`, `rotate`, and
  `expired` events.
- **Specialized Errors**: Explicit error classes (`SessionConflictError`, etc.)
  for robust failure handling.
- **Flash Messages**: Simple temporary data persistence for redirects.
- **Fresh 2.0 Native**: Built-in `createDefineSession` helper for
  zero-boilerplate setup.
- **Secure Defaults**: HTTP-only, secure cookies, 128-bit session IDs.
- **Session Security**: Optional User-Agent validation and IP tracking.
- **CLI Init**: Easy setup tool.
- **Benchmarks**: Formal performance suite for
  [comparing storage backends](./bench/README.md).

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

This library uses **Optimistic Concurrency Control (OCC)** to prevent silent
data loss during overlapping requests. There are two usage patterns depending on
how much consistency a given mutation requires.

#### Direct assignment (most cases)

For low-stakes mutations — setting a preference, storing a theme, toggling a
flag — direct property assignment is the simplest and recommended approach:

```typescript
ctx.state.session.theme = "dark";
```

If two requests collide, the first write wins. The losing write is dropped and a
warning is logged:

```
[session] Optimistic locking failure for session XYZ. Concurrent modification detected.
```

This is acceptable for non-critical state where an occasional lost write has no
meaningful consequence.

#### `session.update()` (critical mutations)

For mutations where every write matters — incrementing a counter, updating a
cart, advancing a state machine — use `session.update()`. It performs a
read-transform-write loop with automatic retry on conflict:

> [!WARNING]
> **Transform Purity**: The transform function should be a pure function of the
> session data. Avoid reading external state (DB, APIs) inside the transform, as
> these reads will not be automatically refreshed on retry, potentially leading
> to inconsistent results.

> [!NOTE]
> **Latency Profile**: Each retry attempt involves a network round-trip to the
> store. Worst-case latency is roughly `(maxRetries + 1) * store_latency`.

```typescript
export const handler = define.handlers({
  async POST(ctx) {
    const result = await ctx.state.session.update(async (data) => {
      data.cart.push(newItem);
      return data;
    }, {
      maxRetries: 3, // default: 3
      onExhausted: "warn", // "warn" (default) | "throw"
    });

    if (result.ok) {
      return ctx.redirect("/cart");
    } else {
      // result.reason: "exhausted" | "store_error" | "not_found"
      return new Response("Could not update cart. Please try again.", {
        status: 503,
      });
    }
  },
});
```

**How it works:**

1. Reads the current session and versionstamp from the store.
2. Runs your transform against the freshest data.
3. Attempts an atomic write with a versionstamp check.
4. If a conflict is detected, repeats from step 1 up to `maxRetries` times.
5. Returns a typed result — never silently swallows failures.

**`onExhausted` behavior:**

| Value              | Behavior                                                                                              |
| :----------------- | :---------------------------------------------------------------------------------------------------- |
| `"warn"` (default) | Logs a warning and returns `{ ok: false, reason: "exhausted" }`. The caller decides how to handle it. |
| `"throw"`          | Throws an error. Use when you want unhandled exhaustion to surface as a 500.                          |

> **Note:** `session.update()` only retries within the session/storage layer. It
> never re-runs your route handler, so side effects (emails, DB writes, etc.) in
> `ctx.next()` are not repeated.

> **KvDexSessionStorage requirement:** The `db` instance must be passed when
> constructing `KvDexSessionStorage` for `update()` to use atomic operations. If
> omitted, `update()` will return `{ ok: false, reason: "store_error" }` and log
> a warning. See [Store Limitations](#store-limitations).

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

## Schema Evolution & Migrations

As your application grows, your session data schema will inevitably change. `fresh-session` provides a robust, dual-layer versioning system to manage these changes without losing user data.

### Dual-Layer Versioning

Two independent versioning systems coexist in every session record:

1.  **Middleware Version (`__v`)**: Managed entirely by the package. This ensures your sessions remain compatible with library updates.
2.  **Application Version (`__appV`)**: Managed by you. This allows you to migrate your own session data (e.g., renaming fields, restructuring objects).

### Configuring Migrations

Define a migration chain in your session configuration. Migrations are functions that take the session data from the previous version and return the data for the new version.

```typescript
// config/session.ts
export const session = createSessionMiddleware<State>({
  store: new DenoKvSessionStorage(),
  migrate: {
    version: 2, // Current application version
    migrations: {
      // Migrate from v0 (missing version) to v1
      1: (data) => {
        // data is 'unknown' - cast safely to previous version
        const old = data as { username: string };
        return {
          email: old.username, // Rename field
          settings: { theme: "light" }, // Add defaults
        };
      },
      // Migrate from v1 to v2
      2: (data) => {
        const old = data as { email: string; settings: { theme: string } };
        return {
          ...old,
          settings: {
            ...old.settings,
            notifications: true, // Add new setting
          },
        };
      },
    },
    // Policy for sessions from "the future" (e.g. rollback situations)
    // "invalidate" (default) | "reset" | "keep"
    onUnknownVersion: "invalidate",
    // Optional: immediately write back migrated records to the store
    // forceWriteOnMigration: true, 
  },
});
```

**Key Features:**
- **Sequential Execution**: Migrations run sequentially (e.g., v0 -> v1 -> v2) to bring the record to the target version.
- **Async Support**: Migration functions can be `async`.
    - > [!WARNING]
    - > **Async migrations** should only be used for pure transformations (e.g. hashing a field). Avoid external reads (DB, APIs) inside migrations, as these will not be automatically refreshed if a concurrent write triggers a retry.
- **Lazy Persistence**: Migrations happen in-memory when the session is read. The store is only updated when the session is naturally modified during the request, avoiding unnecessary write I/O. Use `forceWriteOnMigration: true` to override this behavior.
- **Fail-Closed Security**: If a migration function throws an error, the session is invalidated to prevent data corruption.

## Known Limitations

### Concurrency Model

This library uses **Optimistic Concurrency Control (OCC)** with two resolution
paths:

- **Direct assignment** follows a **First-Write-Wins** strategy. Conflicts are
  detected, the losing write is dropped, and a warning is logged. No retry
  occurs. Suitable for non-critical session state.

- **`session.update()`** follows a **Retry** strategy. On conflict, the
  transform is re-applied to the freshest session data and re-attempted, up to
  `maxRetries` times. Suitable for critical mutations. If retries are exhausted,
  a typed failure result is returned rather than silently losing the write.

Neither path re-runs the route handler. Side effects in your handler are never
repeated.

### Store Limitations

- **MemorySessionStorage**: Not safe for multi-process deployments (Deno Deploy
  with multiple isolates, load-balanced containers). Use for local development
  and single-isolate testing only.

- **DenoKvSessionStorage**: Uses standard Deno KV atomicity. Reliable for most
  use cases but lacks the secondary indexing and structured schema of
  `KvDexSessionStorage`. `session.update()` is supported.

- **KvDexSessionStorage**: Requires the `db` instance in the constructor options
  to enable atomic operations and `session.update()`. Omitting `db` will result
  in a **hard startup error** to prevent accidental degradation to non-atomic
  storage in production.

  ```typescript
  // Correct — atomic operations enabled
  new KvDexSessionStorage({ collection: db.sessions, db });

  // Incorrect — throws a hard error at startup
  new KvDexSessionStorage({ collection: db.sessions });
  ```

### Error Resilience

The middleware follows a **Fail-Closed** model:

- **`get()` failure**: The session is treated as invalid. The user is
  effectively logged out for that request.
- **`set()` failure**: Session changes (including flash messages) are lost. The
  request completes to prevent a total crash. Conflicts (version mismatches) are
  logged as `console.warn`. Other storage errors are logged as `console.error`.
- **`update()` exhaustion**: Returns `{ ok: false, reason: "exhausted" }` or
  throws, depending on `onExhausted`.
- **Custom Error Handling**: All stores throw specialized errors
  (`SessionConflictError`, etc.) which can be caught by developers performing
  manual store operations.

## Security Issues

Report any security related issues to security@innovate.dev
