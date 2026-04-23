// This is a dummy file to verify template types in development.
// It is not copied to the user's project.

import { createDefineSession } from "../../define.ts";
import type { State } from "../../session.ts";

export type { State };

export type User = { username: string; email: string };
export interface SessionData extends Record<string, unknown> {
  theme?: "light" | "dark";
}

export const define = createDefineSession<User, SessionData>();

/** @deprecated Use define instead */
export const defineAuth = define;
