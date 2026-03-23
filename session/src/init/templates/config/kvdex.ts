import {
  createSessionMiddleware,
  type SessionOptions,
} from "@innovatedev/fresh-session";
import { collection, kvdex, type KvValue, model } from "@olli/kvdex";
import {
  KvDexSessionStorage,
  type SessionDoc,
} from "@innovatedev/fresh-session/kvdex-store";
import type { State } from "../utils.ts";

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

export const sessionConfig: SessionOptions = {
  store: new KvDexSessionStorage({
    collection: db.sessions,
    userCollection: db.users,
    expireAfter: 60 * 60 * 24 * 7, // 1 week
    // userIndex: "email", // Optional secondary index
  }),
  cookie: {
    name: "sessionId",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  },
  // Enable for Stateless API Token Support (e.g. "Authorization: Bearer <token>")
  // verifyToken: async (token) => {
  //   // const user = await findUserByToken(token);
  //   // return user;
  // },
  // tokenPrefix: "Bearer ", // Optional (Default: "Bearer ")
};

export const session = createSessionMiddleware<State>(sessionConfig);
