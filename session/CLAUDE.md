# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Architecture

`@innovatedev/fresh-session` provides store-agnostic session middleware for Deno
Fresh v2.

### Core middleware (`src/session.ts`)

`createSessionMiddleware<AppState, UserType, TData>()` is the main export. It
handles two authentication flows:

- **Token-based**: Stateless, reads `Authorization` header — bypasses the store
  entirely.
- **Cookie-based**: Full session lifecycle: read → validate expiry → migrate
  schema → resolve user → set context.

The middleware injects a `Session` proxy object into Fresh's context state. The
proxy intercepts property writes to track dirty fields; at response time it
flushes only changed data to the store. Writes use **Optimistic Concurrency
Control (OCC)**: the store returns a version token (`versionstamp` in KV/KvDex,
integer in memory), and a conflicting concurrent write causes
`SessionConflictError`. `session.update(fn, opts)` wraps the retry loop around
this.

**Dual-layer versioning** separates concerns:

- `__v` — middleware schema version (incremented only when `StoredSession`
  structure changes; current = 1)
- `__appV` — application data version (incremented by app-provided `migrate`
  functions in `SessionOptions`)

Migration runs on every session read: `migrations.ts` handles `__v`, then
`SessionOptions.migrate` handles `__appV`.

### Storage backends (`src/stores/`)

| Backend                | File               | When to use                                       |
| ---------------------- | ------------------ | ------------------------------------------------- |
| `MemorySessionStorage` | `stores/memory.ts` | Tests and development only                        |
| `DenoKvSessionStorage` | `stores/kv.ts`     | Production on Deno Deploy                         |
| `KvDexSessionStorage`  | `stores/kvdex.ts`  | Production with typed schema + runtime validation |

All three implement the `SessionStorage` interface from `session.ts`. The KvDex
store additionally manages a Write-Ahead Log (WAL) for crash recovery and syncs
it on construction.

**KvDex store requires `db` at construction** — it hard-fails at startup (not at
request time) if `db` is missing, per ADR-0002.

### Type-safe Fresh integration (`src/define.ts`)

`createDefineSession<TUser, TData, TExtraState>()` returns a typed `Define`
object for Fresh route/middleware definitions, binding `TUser` and `TData` into
`ctx.state` via `SessionContext`.

### Init CLI (`init/`)

`deno run -A jsr:@innovatedev/fresh-session/init` scaffolds session
infrastructure into an existing Fresh project. Templates live in
`init/templates/` and are inserted via `replaceWithIndent()` to preserve
formatting.

### Error types (`src/errors.ts`)

- `SessionConflictError` — OCC version mismatch; caller should retry
- `SessionConfigError` — invalid options at startup
- `SessionValidationError` — bad data at runtime
