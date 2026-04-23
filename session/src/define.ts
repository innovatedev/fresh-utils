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
 *
 * @example
 * ```ts
 * interface User { id: string; name: string; }
 * interface MySessionData { theme: "light" | "dark"; }
 *
 * export const define = createDefineSession<User, MySessionData>();
 *
 * export const handler = define.handlers({
 *   GET(ctx) {
 *     const theme = ctx.state.session.theme; // Strictly typed
 *     return ctx.next();
 *   }
 * });
 * ```
 */
export function createDefineSession<
  TUser = unknown,
  TData = SessionData,
> // deno-lint-ignore no-explicit-any
(): any {
  return createDefine<State<TUser, TData>>();
}

/**
 * Shorthand for a Fresh context with session state.
 */
export type SessionContext<
  TUser = unknown,
  TData = SessionData,
  TState = Record<string, unknown>,
> = Context<State<TUser, TData> & TState>;
