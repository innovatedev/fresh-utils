import {
  createSessionMiddleware,
  type SessionOptions,
} from "@innovatedev/fresh-session";
import { DenoKvSessionStorage } from "@innovatedev/fresh-session/kv-store";
import type { State } from "../utils.ts";

export const sessionConfig: SessionOptions = {
  // 7 days expiration, persistent in KV
  store: new DenoKvSessionStorage({
    expireAfter: 60 * 60 * 24 * 7, // 1 week
    // userKeyPrefix: ["users"], // Uncomment to enable automatic user resolution
  }),
  cookie: {
    name: "sessionId",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  },
};

export const session = createSessionMiddleware<State>(sessionConfig);
