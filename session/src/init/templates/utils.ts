// This is a dummy file to verify template types in development.
// It is not copied to the user's project.

import { createDefine } from "fresh";
import type { State } from "../../session.ts";

export type { State };
export const define = createDefine<State>();

export type User = { username: string; email: string };
export type AuthState = State & { user: User; userId: string };
export const defineAuth = createDefine<AuthState>();
