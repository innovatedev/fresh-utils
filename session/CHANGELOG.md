# Changelog

## 0.3.9

- **Init**: Kvdex presets now generate a `kv/` folder with `db.ts` and
  `models.ts` for better project structure.
- **Init**: `utils.ts` State patching now preserves `shared: string`,
  adds `User` type for kvdex, and extends `SessionState<User>`.
- **Init**: Added generic JSR dependency sanitization for `@olli/kvdex` and others.
- **Init**: Added kvdex-basic and kvdex-prod to CLI preset help text.

## 0.3.8

- **Init**: Improved JSR import sanitization to handle `jsr:@scope/pkg@version` rewrites.
- **Init**: Automatically integrates session State into `utils.ts`.
- **Init**: Adds `/// <reference lib="deno.unstable" />` to `main.ts` for KV presets.

## 0.3.7

- **Exports**: Enforce sub-path imports for session stores (e.g., `fresh-session/kv-store`).
- **Init**: Fix command import aliases for kvdex and memory stores.
- **Stores**: Enhance `kvdex` store options.

## 0.3.6

- **Init**: Fixed import modifications for `utils.ts` aliases and `kvdex`
  stores.
- **Exports**: Removed store exports from main entrypoint. Import via sub-paths
  (e.g. `fresh-session/kv-store`) is now required.
- **Docs**: Improved documentation coverage for `kvdex-store`.

## 0.3.5

- Add stateless API token authentication with `verifyToken` option and
  `tokenHeader` configuration.

## 0.3.4

- Added `ctx.state.userId` for easy access to the user ID.

## 0.3.3

### Features

- **Structured KV Support**: Added `KvDexSessionStorage` to support
  [`@olli/kvdex`](https://github.com/oliver-oloughlin/kvdex).
  - Enables fully typed and indexed session documents in Deno KV.
  - Supports using secondary indices for efficient user resolution (e.g.
    `userIndex: "email"`).

### Improvements

- **Init Script**: The `init` command now dynamically resolves versions.
  - Dependencies (`argon2`, `kvdex`) are pinned to verified versions in
    generated configs.
  - The installed `fresh-session` version now matches the version of the `init`
    script used.
- **Documentation**: Added comprehensive JSDoc comments for `kvdex` storage to
  improve JSR documentation score.

## 0.3.0

### Features

- **Session Security**: Added optional User-Agent validation and IP address
  tracking.
  - `trackUserAgent: true`: Validates user agent on every request. Mismatches
    invalidate the session.
  - `trackIp: true`: Tracks client IP address (via `ctx.remoteAddr`).
  - `trackIp: { header: "..." }`: Tracks IP from a specific header (e.g., for
    proxies).

### Improvements

- **Templates**: Added navigation links between Login and Register pages in all
  auth templates.

## 0.2.0

### Breaking Changes

- **Session Architecture**: Refactored internal session storage structure.
  - Removed support for legacy `_system` field nesting. old sessions using this
    format will be reset.
  - `userId` and `lastSeenAt` are now top-level system fields in the stored
    session object.

### Features

- **Flash Messages**: Added `ctx.state.flash(key, value)` and
  `ctx.state.hasFlash(key)` for temporary messages.
- **Explicit Auth**: Added `ctx.state.login(userId, data)` and
  `ctx.state.logout()` methods.
- **Init Script**: Enhanced `init` command with robust templates for Login,
  Logout, and Register.
  - Defaults to secure production preset (KV + Argon2) in non-interactive mode.
  - Automatically configures flash message error handling in templates.
  - Idempotent patching of `main.ts`.
- **Type Safety**: Added generic support to `createSessionMiddleware<State>` for
  fully typed session data usage.
- **Simplified Setup**: `DenoKvSessionStorage` now supports zero-config
  initialization (automatically opens `Deno.openKv()`).
