import { createSessionMiddleware } from "@innovatedev/fresh-session";
import { collection, kvdex, type KvValue, model } from "@olli/kvdex";
import {
  KvDexSessionStorage,
  type SessionDoc,
} from "@innovatedev/fresh-session/kvdex-store";

const kv = await Deno.openKv();

// Define your Session data model
// You can extend this with additional properties if needed
export type SessionData = KvValue;

// Define User model if using resolvedUser (optional)
export type User = {
  username: string;
} & KvValue;

const SessionModel = model<SessionDoc<SessionData>>();
const UserModel = model<User>();

// Create kvdex instance
const db = kvdex({
  kv,
  schema: {
    sessions: collection(SessionModel),
    users: collection(UserModel),
  },
});

export const session = createSessionMiddleware({
  store: new KvDexSessionStorage({
    collection: db.sessions,
    userCollection: db.users,
  }),
});
