# Changelog

## 0.5.0 (Pre-release)

- **Type Safety**: Added a second generic `TData` to `State` and
  `SessionOptions` for strictly typed session data (`ctx.state.session`).
- **Fresh 2.0**: Introduced `createDefineSession` helper for seamless
  integration with Fresh 2.0's `createDefine` pattern.
- **Kvdex Store**: Relaxed `SessionDoc` requirements and introduced
  `createBaseSessionSchema(z)` factory for flexible, zero-dependency Zod
  integration.
- **Ergonomics**: Added `AuthState` and `defineAuth` patterns to generated
  `utils.ts` for strictly typed protected routes.
- **Dependency Isolation**: Completely removed `zod` from library dependencies,
  making it a strictly opt-in feature for Kvdex users.
- **Dependencies**: Updated to `fresh@2.2.2` and `@olli/kvdex@3.6.5`.
- **CLI**: The `init` command now automatically injects `zod@^3.24.0` into user
  projects when Kvdex is selected.

## 0.4.20

- **UI/UX**: Synchronized vanilla Tailwind templates with DaisyUI patterns
- **Accessibility**: Standardized form structures by wrapping inputs inside
  labels across all templates and dynamic field generators.
- **Security**: Added a password confirmation field and matching validation to
  all production registration templates.

## 0.4.19

- **Type Safety**: Introduced `AuthState` and `defineAuth` for strictly typed
  handlers in authenticated routes.
- **Init Refinement**: Fixed the default store to `kvdex` across all entry
  points and updated the CLI description.
- **Init Refinement**: Fixed a logic bug where the "Run with defaults?" prompt
  was being skipped, and ensured manual configuration works correctly when
  answering "No".
- **Init Refinement**: Optimized `utils.ts` patching to intelligently handle
  `User` imports vs local definitions and fixed logic precedence in validation
  templates.
- **Refactoring**: Moved common initialization utilities to `helpers.ts` and
  added comprehensive patcher tests.

## 0.4.18

- **Init**: Fixed registration validation being stripped and improved logic
  precedence with proper parentheses.
- **Init**: Optimized Argon2 imports (import only `verify` or `hash` as needed)
  and fixed missing `await` in generated logout route.
- **Init**: Consolidated default configuration and improved CLI flag reliability
  in interactive mode.
- **Tests**: Added regression test suite for initialization templates.

## 0.4.17

- **Dynamic Database Configuration**: Kvdex primary indices are now
  automatically configured based on your chosen authentication fields (username
  and/or email).

## 0.4.16

- **DaisyUI Support**: Added dedicated template variations for projects using
  DaisyUI, featuring native components and full theme/dark-mode support.
- **Perfect Code Generation**: Dynamic code injection now respects your
  project's indentation, and generated files are automatically cleaned of
  internal lint suppressions.
- **Improved Authentication Flow**: Auth routes now handle validation errors
  gracefully, providing specific feedback (e.g., "User already exists") instead
  of generic failures.
- **UI Refinements**: Standardized form fields and labels across all templates
  for a consistent, premium look.
- **Bug Fixes**: Resolved syntax errors in generated logout handlers and
  improved button clickability in DaisyUI headers.

## 0.4.15

- **Init**: Implemented indentation-aware code injection for perfectly formatted
  output in generated files.
- **Init**: Automatically strips internal `deno-lint-ignore` directives from
  produced project files for a cleaner developer experience.
- **Init**: Fixed a syntax error in the generated `/logout` route.
- **Init**: Optimized registration field extraction logic and standardized
  variable naming.

## 0.4.14

- **Init**: Improved template compatibility with Deno workspace type-checking
  and standard IDE tooling.
- **Init**: Restored standard internal project structure by relocating templates
  back to `src/init/templates/` with original file extensions.
- **Init**: Enhanced the robustness of dynamic code generation and field
  validation during initialization.

## 0.4.13

- **Init**: Added support for configurable user fields (`username` and `email`).
  Users can now selectively enable these fields and choose a primary login
  identifier during initialization.
- **Init**: Overhauled authentication UI.

## 0.4.12

- **Init**: Fixed relative path resolution for static imports in nested route
  groups (e.g., `(guest)/login.tsx`).

## 0.4.11

- **Init**: Refactored `argon2` imports to be injected via `AUTH_IMPORTS`
  alongside database imports, simplifying template maintenance.
- **Init**: Authentication templates now use static top-level imports instead of
  dynamic `await import()` for better performance and DX.
- **Init**: Fixed dynamic `kv/` import resolution in nested route groups.
- **Exports**: Fixed `guestOnlyMiddleware` and `authOnlyMiddleware` types to be
  compatible with strict project `State` interfaces.

## 0.4.10

- **Init**: Fixed `Button.tsx` import resolution in route groups.

## 0.4.9

- **Init**: Consolidated all prompts to the beginning of the process.
- **Init**: Added "Run with defaults? (Kvdex Production, Argon2, Prefix: none)"
  shortcut.
- **Init**: Added "Reset lock file?" option to resolve Preact dependency issues
  (runs `rm deno.lock && deno install`).
- **Init**: All prompts now default to "Yes".

## 0.4.8

- **Exports**: Renamed `guestOnly` and `authOnly` to `guestOnlyMiddleware` and
  `authOnlyMiddleware`.
- **Init**: Fixed relative import resolution for nested route groups and ensured
  consistent use of `@/` alias.

## 0.4.7

- **Exports**: Added `guestOnly` and `authOnly` middleware helpers.
- **Init**: Authentication routes (`login`, `register`, `logout`) are now
  generated within `(guest)/` and `(auth)/` route groups with automatic
  middleware-based redirection.

## 0.4.6

- **Init**: Fixed props for define on `_app.tsx`.
- **Init**: Fixed signals version to match `fresh@2.2.0`.

## 0.4.5

- **Init**: Fixed Kvdex authentication logic to correctly use primary indices
  for username lookups.
- **Init**: Standardized session registration to log in using the generated
  document ID, ensuring compatibility with `KvDexSessionStorage`.
- **Init**: Cleaned up auth templates to remove redundant hardcoded login calls.

## 0.4.4

- **Init**: Store-aware authentication templates (`login.tsx`, `register.tsx`)
  now dynamically inject logic for the selected store (Deno KV or Kvdex).
- **Init**: Robust `_app.tsx` patching handles `define.page` patterns and
  optional type annotations more reliably.
- **Init**: Added `passwordHash` to the `UserModel` template for Kvdex presets.
- **CI**: Migrated to Node.js 24 and `actions/checkout@v6` for improved security
  and compliance.

## 0.4.3

- **Init**: Simplified DaisyUI detection to strictly check
  `deno.json`/`deno.jsonc`.
- **Init**: Refactored `CWD` to dynamic `getCWD()` function for better
  testability and isolation.
- **Init**: Fixed `sanitizeImports` to correctly handle JSR/NPM dependency
  specifiers and versions.
- **Tests**: Replaced filesystem-dependent tests with fully isolated unit tests
  using mock file readers.

## 0.4.2

- **Init**: Removed npm/jsr prefix in generated files

## 0.4.1

- **Init**: Fixed `deno.json` import alias for `fresh-session` to use `npm:`
  specifier.

## 0.4.1

- **Refactored `init` Command**: Split monolithic `init.ts` into modular
  `helpers.ts` and `patchers.ts` for better maintainability.
- **Configurable Auth Route Prefix**: Added support for custom auth routes
  (e.g., `/auth/login`) via the initialization prompt.
- **Improved `_app.tsx` Patching**: Added support for projects using
  `define.page` for their main App component.
- **Refined DaisyUI Detection**: Improved detection logic to support Tailwind v4
  and varied configuration patterns.
- **Stabilized Header Island**: Fixed dependency resolution for the fallback
  Header island by using explicit npm specifiers.
- **Optimized CLI Flow**: Consolidated all user prompts to the beginning of the
  initialization process for a better UX.

## 0.4.0

- **Init**: Automatically generates a global `Header` island and injects it into
  `routes/_app.tsx`.
- **Init**: Detects the `daisyui` plugin in `deno.json` and supplies a native
  DaisyUI Header variant utilizing pure CSS `<details>` dropdowns.
- **Init**: Universalizes authentication templates (Login & Register) to import
  and use the host project's default generic `<Button>` component instead of
  hardcoded framework classes.
- **Init**: Updates the generated `/logout` route template to securely use a
  `POST` handler instead of `GET`.
- **Init**: Fix login and register templates to not pass redundant
  `{ username }` in session data.

## 0.3.9

- **Init**: Kvdex presets now generate a `kv/` folder with `db.ts` and
  `models.ts` for better project structure.
- **Init**: `utils.ts` State patching now preserves `shared: string`, adds
  `User` type for kvdex, and extends `SessionState<User>`.
- **Init**: Added generic JSR dependency sanitization for `@olli/kvdex` and
  others.
- **Init**: Added kvdex-basic and kvdex-prod to CLI preset help text.

## 0.3.8

- **Init**: Improved JSR import sanitization to handle `jsr:@scope/pkg@version`
  rewrites.
- **Init**: Automatically integrates session State into `utils.ts`.
- **Init**: Adds `/// <reference lib="deno.unstable" />` to `main.ts` for KV
  presets.

## 0.3.7

- **Exports**: Enforce sub-path imports for session stores (e.g.,
  `fresh-session/kv-store`).
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
