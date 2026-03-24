import { type KvValue, model } from "@olli/kvdex";
import type { SessionDoc } from "@innovatedev/fresh-session/kvdex-store";

// Define your Session data model
// You can extend this with additional properties if needed
export type SessionData = KvValue;

// Define User model for session user resolution
export type User = {
{{USER_FIELDS}}
} & KvValue;

export const SessionModel = model<SessionDoc<SessionData>>();
export const UserModel = model<User>();
