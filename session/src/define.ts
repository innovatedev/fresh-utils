/**
 * @module
 *
 * Fresh 2.0 "Define" Integration.
 *
 * Provides a helper to create a strictly typed Fresh `define` object
 * with session and user state pre-configured.
 */

import { type Context, createDefine } from "fresh";
import type { SessionData, State } from "./session.ts";

/**
 * Creates a Fresh `define` helper with session state pre-configured.
 *
 * @template TUser The type of the user object.
 * @template TData The type of the custom session data.
 * @template TExtraState Optional extra state to merge (e.g. from other plugins).
 *
 * @example
 * ```ts
 * interface User { id: string; name: string; }
 * interface MySessionData { theme: "light" | "dark"; }
 * interface ExtraState { plugins: Record<string, any> }
 *
 * export const define = createDefineSession<User, MySessionData, ExtraState>();
 *
 * export const handler = define.handlers({
 *   GET(ctx) {
 *     const theme = ctx.state.session.theme; // Strictly typed
 *     const plugins = ctx.state.plugins;     // Also typed
 *     return ctx.next();
 *   }
 * });
 * ```
 */
export function createDefineSession<
  TUser = unknown,
  TData = SessionData,
  TExtraState = Record<string, unknown>,
> // deno-lint-ignore no-explicit-any
(): any {
  return createDefine<State<TUser, TData> & TExtraState>();
}

/**
 * Shorthand for a Fresh context with session state.
 */
export type SessionContext<
  TUser = unknown,
  TData = SessionData,
  TState = Record<string, unknown>,
> = Context<State<TUser, TData> & TState>;
