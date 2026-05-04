/**
 * Tests for the session introspection API:
 * - getSessionsForUser
 * - revokeOtherSessions
 * - storeSupports type guard
 * - session.update() timeoutMs
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createSessionMiddleware, storeSupports } from "../src/session.ts";
import { MemorySessionStorage } from "../src/stores/memory.ts";
import { DenoKvSessionStorage } from "../src/stores/kv.ts";
import { getSetCookies } from "@std/http/cookie";

// ---------------------------------------------------------------------------
// storeSupports type guard
// ---------------------------------------------------------------------------

Deno.test("storeSupports: returns true for MemorySessionStorage.getSessionsForUser", () => {
  const store = new MemorySessionStorage();
  assertEquals(storeSupports(store, "getSessionsForUser"), true);
});

Deno.test("storeSupports: returns false for DenoKvSessionStorage.getSessionsForUser", async () => {
  const kv = await Deno.openKv(":memory:");
  const store = new DenoKvSessionStorage(kv);
  assertEquals(storeSupports(store, "getSessionsForUser"), false);
  kv.close();
});

// ---------------------------------------------------------------------------
// getSessionsForUser via middleware API — MemorySessionStorage
// ---------------------------------------------------------------------------

Deno.test("getSessionsForUser: returns sessions for known user from memory store", async () => {
  const store = new MemorySessionStorage();
  const middleware = createSessionMiddleware({ store });

  // Session 1 — login inside next() so the session is written on response
  // deno-lint-ignore no-explicit-any
  const ctx1: any = {
    req: new Request("http://localhost/login"),
    state: {},
    next: async () => {
      await ctx1.state.login("user-multi");
      return new Response("ok");
    },
  };
  const res1 = await middleware(ctx1);
  const sid1 = getSetCookies(res1.headers).find((c) => c.name === "sessionId")
    ?.value;
  assertExists(sid1);

  // Session 2 — a second login for the same user
  // deno-lint-ignore no-explicit-any
  const ctx2: any = {
    req: new Request("http://localhost/login"),
    state: {},
    next: async () => {
      await ctx2.state.login("user-multi");
      return new Response("ok");
    },
  };
  const res2 = await middleware(ctx2);
  const sid2 = getSetCookies(res2.headers).find((c) => c.name === "sessionId")
    ?.value;
  assertExists(sid2);

  // Query introspection from a third context using session 1's cookie
  let sessions: { sid: string; session: unknown }[] = [];
  // deno-lint-ignore no-explicit-any
  const ctx3: any = {
    req: new Request("http://localhost/check", {
      headers: { Cookie: `sessionId=${sid1}` },
    }),
    state: {},
    next: async () => {
      sessions = await ctx3.state.getSessionsForUser("user-multi");
      return new Response("ok");
    },
  };
  await middleware(ctx3);

  assertEquals(sessions.length, 2, "Should have 2 active sessions");
  for (
    const entry of sessions as { sid: string; session: { userId?: string } }[]
  ) {
    assertExists(entry.sid);
    assertEquals(entry.session.userId, "user-multi");
  }
});

Deno.test("getSessionsForUser: returns empty array for unsupported store", async () => {
  const kv = await Deno.openKv(":memory:");
  const store = new DenoKvSessionStorage(kv);
  // KV store generates a rotation-error log when login() is called on a new
  // session (delete of undefined key). Suppress with a silent logger.
  const middleware = createSessionMiddleware({
    store,
    logger: { warn: () => {}, error: () => {} },
  });

  let sessions: unknown[] = [];
  // deno-lint-ignore no-explicit-any
  const ctx: any = {
    req: new Request("http://localhost/"),
    state: {},
    next: async () => {
      await ctx.state.login("user-kv");
      sessions = await ctx.state.getSessionsForUser("user-kv");
      return new Response("ok");
    },
  };
  await middleware(ctx);

  assertEquals(sessions.length, 0, "KV store should return empty array");
  kv.close();
});

// ---------------------------------------------------------------------------
// revokeOtherSessions
// ---------------------------------------------------------------------------

Deno.test("revokeOtherSessions: deletes other sessions, keeps current", async () => {
  const store = new MemorySessionStorage();
  const middleware = createSessionMiddleware({ store });

  // Create session 1
  // deno-lint-ignore no-explicit-any
  const ctx1: any = {
    req: new Request("http://localhost/login"),
    state: {},
    next: async () => {
      await ctx1.state.login("user-revoke");
      return new Response("ok");
    },
  };
  const res1 = await middleware(ctx1);
  const sid1 = getSetCookies(res1.headers).find((c) => c.name === "sessionId")
    ?.value;
  assertExists(sid1);

  // Create session 2 (same user)
  // deno-lint-ignore no-explicit-any
  const ctx2: any = {
    req: new Request("http://localhost/login"),
    state: {},
    next: async () => {
      await ctx2.state.login("user-revoke");
      return new Response("ok");
    },
  };
  await middleware(ctx2);

  // Revoke all other sessions from session 1's perspective
  let remaining: { sid: string }[] = [];
  // deno-lint-ignore no-explicit-any
  const ctx3: any = {
    req: new Request("http://localhost/revoke", {
      headers: { Cookie: `sessionId=${sid1}` },
    }),
    state: {},
    next: async () => {
      await ctx3.state.revokeOtherSessions("user-revoke");
      remaining = await ctx3.state.getSessionsForUser("user-revoke");
      return new Response("ok");
    },
  };
  await middleware(ctx3);

  assertEquals(remaining.length, 1, "Only current session should remain");
  assertEquals(
    remaining[0].sid,
    sid1,
    "Remaining session should be the current one",
  );
});

// ---------------------------------------------------------------------------
// session.update() timeoutMs
// ---------------------------------------------------------------------------

Deno.test("session.update(): respects timeoutMs budget across retries", async () => {
  const { SessionConflictError } = await import("../src/errors.ts");
  const store = new MemorySessionStorage();
  // Use a silent logger — logger.warn is expected on exhaustion and should not pollute output
  const middleware = createSessionMiddleware({
    store,
    logger: { warn: () => {}, error: () => {} },
  });

  // Create a session first
  // deno-lint-ignore no-explicit-any
  const ctx1: any = {
    req: new Request("http://localhost/"),
    state: {},
    next: () => {
      ctx1.state.session.counter = 0;
      return Promise.resolve(new Response("ok"));
    },
  };
  const res1 = await middleware(ctx1);
  const sid = getSetCookies(res1.headers).find((c) => c.name === "sessionId")
    ?.value;
  assertExists(sid);

  // Override set to always conflict (forces the retry loop) and delay (consumes budget)
  store.set = async () => {
    await new Promise((r) => setTimeout(r, 30)); // 30ms per attempt
    throw new SessionConflictError();
  };

  let result: { ok: boolean; reason?: string } = { ok: true };
  // deno-lint-ignore no-explicit-any
  const ctx2: any = {
    req: new Request("http://localhost/update", {
      headers: { Cookie: `sessionId=${sid}` },
    }),
    state: {},
    next: async () => {
      // timeoutMs=50ms, each attempt takes ~30ms → second attempt check should fail
      result = await ctx2.state.session.update(
        (data: { counter: number }) => ({ ...data, counter: data.counter + 1 }),
        { timeoutMs: 50, maxRetries: 100, onExhausted: "warn" },
      );
      return new Response("ok");
    },
  };
  await middleware(ctx2);

  assertEquals(
    result.ok,
    false,
    "Update should fail when timeoutMs is exceeded",
  );
  if (!result.ok) {
    assertEquals(result.reason, "exhausted");
  }
});
