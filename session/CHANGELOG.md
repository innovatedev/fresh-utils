# Changelog

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
