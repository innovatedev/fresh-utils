import {
  createSessionMiddleware,
  type SessionOptions,
} from "@innovatedev/fresh-session";
import { KvDexSessionStorage } from "@innovatedev/fresh-session/kvdex-store";
import { db } from "../kv/db.ts";
import type { State } from "../utils.ts";

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
