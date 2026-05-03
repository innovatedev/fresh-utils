import { type KvValue, model } from "@olli/kvdex";
import { sessionModel } from "@innovatedev/fresh-session/kvdex-store";

// Define your Session data model
// You can extend this with additional properties if needed
export type SessionData = KvValue;

// Define User model for session user resolution
// deno-lint-ignore ban-types
export type User = {
  // {{USER_FIELDS}}
} & KvValue;

// export const SessionModel = sessionModel(type({ theme: "'light' | 'dark'" }));
export const SessionModel = sessionModel<SessionData>();
export const UserModel = model<User>();
