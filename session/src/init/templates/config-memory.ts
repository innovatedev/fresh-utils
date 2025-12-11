import { createSessionMiddleware, type SessionOptions } from "@innovatedev-fresh/session";
import { MemorySessionStorage } from "@innovatedev-fresh/session/memory-store";
import type { State } from "../utils.ts";

export const sessionConfig: SessionOptions = {
  store: new MemorySessionStorage(),
  cookie: {
    name: "sessionId",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    // maxAge: 60 * 60 * 24 * 7, // 1 week
  },
};

export const session = createSessionMiddleware<State>(sessionConfig);

