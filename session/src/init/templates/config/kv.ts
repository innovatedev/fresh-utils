import {
  createSessionMiddleware,
  type SessionOptions,
} from "@innovatedev/fresh-session";
import { DenoKvSessionStorage } from "@innovatedev/fresh-session/kv-store";
import type { State } from "../utils.ts";
import { migrationConfig } from "./session.migrate.ts";

export const sessionConfig: SessionOptions = {
  // 7 days expiration, persistent in KV
  store: new DenoKvSessionStorage({
    expireAfter: 60 * 60 * 24 * 7, // 1 week KV TTL
    // userKeyPrefix: ["users"], // Uncomment to enable automatic user resolution
  }),
  expiry: 60 * 60 * 24 * 7, // 1 week idle timeout (server-enforced)
  absoluteExpiry: 60 * 60 * 24 * 30, // 30-day hard limit (adjust to suit your compliance requirements)
  migrate: migrationConfig,
  // {{TRACKING_OPTIONS}}
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
  // logger: console, // Optional custom logger
  // onEvent: (event) => console.log(`[session] ${event.type}: ${event.sessionId}`),
};

export const session = createSessionMiddleware<State>(sessionConfig);
