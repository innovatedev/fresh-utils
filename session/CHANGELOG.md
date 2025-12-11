# Changelog

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
