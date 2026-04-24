import { createDefineSession, type Define } from "../../define.ts";
import type { State } from "../../session.ts";

export type { State };

export type User = { username: string; email: string };
export interface SessionData extends Record<string, unknown> {
  theme?: "light" | "dark";
}

/**
 * Extra state from other plugins (e.g. plugins: Record<string, any>)
 */
export interface ExtraState extends Record<string, unknown> {}

/**
 * Standard Fresh 2.0 define helper with session state.
 * Use this for most pages and public handlers.
 *
 * Generics: <User, SessionData, ExtraState>
 */
export const define = createDefineSession<User, SessionData, ExtraState>();

/**
 * Strictly typed state for authenticated routes.
 * Guarantees that 'user' and 'userId' are present.
 */
export type AuthState = State<User, SessionData> & ExtraState & {
  user: User;
  userId: string;
};

/**
 * Authenticated define helper.
 * Use this for routes that require a logged-in user.
 */
export const defineAuth = define as Define<AuthState>;
