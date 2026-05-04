import {
  createSessionMiddleware,
  type SessionOptions,
} from "@innovatedev/fresh-session";
import { MemorySessionStorage } from "@innovatedev/fresh-session/memory-store";
import type { State } from "../utils.ts";
import { migrationConfig } from "./session.migrate.ts";

// WARNING: MemorySessionStorage is for development and testing only.
// Sessions are stored in process memory and will be lost on every server restart.
// Switch to DenoKvSessionStorage or KvDexSessionStorage before deploying to production.
console.warn(
  "[session] MemorySessionStorage detected. Sessions will not persist across restarts. " +
    "Use DenoKvSessionStorage or KvDexSessionStorage in production.",
);

export const sessionConfig: SessionOptions = {
  store: new MemorySessionStorage(),
  expiry: 60 * 60 * 8, // 8-hour idle timeout
  absoluteExpiry: 60 * 60 * 24 * 30, // 30-day hard limit (adjust to suit your compliance requirements)
  migrate: migrationConfig,
  // {{TRACKING_OPTIONS}}
  cookie: {
    name: "sessionId",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 8, // 8 hours
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
