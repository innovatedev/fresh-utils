// This is a dummy file to verify template types in development.
// It is not copied to the user's project.

import { createDefineSession } from "../../define.ts";
import type { State } from "../../session.ts";

export type { State };

export type User = { username: string; email: string };
export interface SessionData extends Record<string, unknown> {
  theme?: "light" | "dark";
}

/**
 * Standard Fresh 2.0 define helper with session state.
 * Use this for most pages and public handlers.
 */
export const define = createDefineSession<User, SessionData>();

/**
 * Strictly typed state for authenticated routes.
 * Guarantees that 'user' and 'userId' are present.
 */
export type AuthState = State<User, SessionData> & {
  user: User;
  userId: string;
};

/**
 * Authenticated define helper.
 * Use this for routes that require a logged-in user.
 */
// deno-lint-ignore no-explicit-any
export const defineAuth = define as any; // Casted to ensure safety in handlers
