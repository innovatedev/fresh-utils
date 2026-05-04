import { expect } from "./deps.ts";
import { getSetCookies } from "@std/http/cookie";
import {
  type Context,
  createSessionMiddleware,
  type State,
  type StoredSession,
} from "../src/mod.ts";
import { MemorySessionStorage } from "../src/stores/memory.ts";

const sessionStore = new MemorySessionStorage();
const sessionMiddleware = createSessionMiddleware({ store: sessionStore });

Deno.test("Integration: Session persistence real flow", async (t) => {
  let savedSessionId: string | undefined;

  await t.step("Step 1: Set Session Data", async () => {
    const ctx1 = {
      req: new Request("http://localhost/"),
      state: {} as State,
      next: () => {
        // Simulate handler setting data
        ctx1.state.session.name = "Alice";
        return Promise.resolve(new Response("Body 1"));
      },
    } as unknown as Context<State>;

    const res1 = await sessionMiddleware(ctx1);
    const cookies = getSetCookies(res1.headers);
    const sessionCookie = cookies.find((c) => c.name === "sessionId");

    expect(sessionCookie).toBeDefined();
    savedSessionId = sessionCookie!.value;
  });

  await t.step("Step 2: Read Session Data", async () => {
    expect(savedSessionId).toBeDefined();

    const ctx2 = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${savedSessionId}` },
      }),
      state: {} as State,
      next: () => {
        // Simulate handler reading data
        return Promise.resolve(
          new Response(`Hello, ${ctx2.state.session.name}`),
        );
      },
    } as unknown as Context<State>;

    const res2 = await sessionMiddleware(ctx2);
    const text = await res2.text();

    expect(text).toEqual("Hello, Alice");
  });

  await t.step("Step 3: Rotate Session", async () => {
    const ctx3 = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${savedSessionId}` },
      }),
      state: {} as State, // Initial state will be hydrated by middleware
      next: () => {
        // Simulate handler requesting rotation by changing ID
        // Note: The middleware overwrites this value with a secure one.
        ctx3.state.sessionId = "unsafe-login-id";
        return Promise.resolve(new Response("Rotated"));
      },
    } as unknown as Context<State>;

    const res3 = await sessionMiddleware(ctx3);
    const cookies = getSetCookies(res3.headers);
    const sessionCookie = cookies.find((c) => c.name === "sessionId");

    expect(sessionCookie).toBeDefined();
    const newSessionId = sessionCookie!.value;

    // Verify rotation logic:
    // 1. New ID is NOT the unsafe one set by handler
    expect(newSessionId).not.toEqual("unsafe-login-id");
    // 2. New ID is different from old ID
    expect(newSessionId).not.toEqual(savedSessionId);

    // 3. Old session ID should arguably be invalid now.
    // Ideally we'd check the store, but we can't access it here.
    // We can verify by making a request with the old ID and seeing empty session.

    const ctxOld = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${savedSessionId}` },
      }),
      state: {} as State,
      next: () => Promise.resolve(new Response("Check")),
    } as unknown as Context<State>;
    await sessionMiddleware(ctxOld);
    // Should be empty/new session because old key was deleted
    expect(ctxOld.state.session.name).toBeUndefined();
    expect(ctxOld.state.sessionId).not.toEqual(savedSessionId);
  });

  await t.step("Step 4: Recover from Invalid Session", async () => {
    const bogusId = "non-existent-session-id";
    const ctx4 = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${bogusId}` },
      }),
      state: {} as State,
      next: () => Promise.resolve(new Response("Recovery")),
    } as unknown as Context<State>;

    const res4 = await sessionMiddleware(ctx4);
    const cookies = getSetCookies(res4.headers);
    const sessionCookie = cookies.find((c) => c.name === "sessionId");

    expect(sessionCookie).toBeDefined();
    const newSessionId = sessionCookie!.value;

    // Verify:
    // 1. We got a new ID
    expect(newSessionId).not.toEqual(bogusId);
    // 2. State should be empty (new session)
    expect(ctx4.state.session).toEqual({});
  });

  await t.step("Step 5: Logout", async () => {
    // Reuse savedSessionId if available, or just mock one since logout shouldn't care
    const oldId = savedSessionId || "some-old-id";
    const ctx5 = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${oldId}` },
      }),
      state: {} as State,
      next: () => {
        ctx5.state.logout();
        return Promise.resolve(new Response("Logged out"));
      },
    } as unknown as Context<State>;

    const res5 = await sessionMiddleware(ctx5);
    const cookies = getSetCookies(res5.headers);
    const sessionCookie = cookies.find((c) => c.name === "sessionId");

    // The cookie should NOT be empty (cleared), but should be a NEW valid session
    expect(sessionCookie).toBeDefined();
    const newSessionId = sessionCookie!.value;

    expect(newSessionId).toBeTruthy(); // Not empty string
    expect(newSessionId).not.toEqual(oldId); // Rotated
    expect(newSessionId!.length).toBeGreaterThan(10); // Valid UUID-ish

    // State should be reset
    expect(ctx5.state.session).toEqual({});
    expect(ctx5.state.sessionId).toEqual(newSessionId);
  });
});

Deno.test("Integration: Session Security (UA/IP)", async (t) => {
  const store = new MemorySessionStorage();
  const options = {
    store,
    trackUserAgent: true,
    trackIp: true, // Uses remoteAddr by default
  };
  const middleware = createSessionMiddleware(options);

  let savedId: string;

  await t.step("Step 1: Create Session with UA/IP", async () => {
    const ctx = {
      req: new Request("http://localhost/", {
        headers: { "User-Agent": "Chrome/9000" },
      }),
      info: {
        remoteAddr: { hostname: "1.2.3.4", port: 1234, transport: "tcp" },
      },
      state: {} as State,
      next: () => {
        ctx.state.session.foo = "bar";
        return Promise.resolve(new Response("OK"));
      },
    } as unknown as Context<State>;

    const res = await middleware(ctx);
    const cookies = getSetCookies(res.headers);
    savedId = cookies.find((c) => c.name === "sessionId")!.value;

    expect(savedId).toBeDefined();

    // Verify internally that it's stored (white-box test via store)
    const stored = await store.get(savedId) as StoredSession;
    expect(stored.ua).toEqual("Chrome/9000");
    expect(stored.ip).toEqual("1.2.3.4");
  });

  await t.step("Step 2: Validate UA Match (Success)", async () => {
    const ctx = {
      req: new Request("http://localhost/", {
        headers: {
          "Cookie": `sessionId=${savedId}`,
          "User-Agent": "Chrome/9000",
        },
      }),
      info: {
        remoteAddr: { hostname: "1.2.3.4", port: 1234, transport: "tcp" },
      },
      state: {} as State,
      next: () => Promise.resolve(new Response("OK")),
    } as unknown as Context<State>;

    await middleware(ctx);
    // Session should be preserved
    expect(ctx.state.sessionId).toEqual(savedId);
    expect(ctx.state.session.foo).toEqual("bar");
  });

  await t.step("Step 3: Validate UA Mismatch (Invalidation)", async () => {
    const ctx = {
      req: new Request("http://localhost/", {
        headers: {
          "Cookie": `sessionId=${savedId}`,
          "User-Agent": "Firefox/1", // Different
        },
      }),
      info: {
        remoteAddr: { hostname: "1.2.3.4", port: 1234, transport: "tcp" },
      },
      state: {} as State,
      next: () => Promise.resolve(new Response("OK")),
    } as unknown as Context<State>;

    const res = await middleware(ctx);
    const cookies = getSetCookies(res.headers);
    const newId = cookies.find((c) => c.name === "sessionId")!.value;

    // Should receive NEW session ID
    expect(newId).not.toEqual(savedId);
    expect(ctx.state.session).toEqual({}); // Empty
  });
});

Deno.test("Integration: Session Security (Custom IP Header)", async (t) => {
  const store = new MemorySessionStorage();
  const options = {
    store,
    trackIp: { header: "X-Forwarded-For" },
  };
  const middleware = createSessionMiddleware(options);

  await t.step("Step 1: Capture IP from Header", async () => {
    const ctx = {
      req: new Request("http://localhost/", {
        headers: { "X-Forwarded-For": "203.0.113.195" },
      }),
      info: {
        remoteAddr: { hostname: "1.2.3.4", port: 1234, transport: "tcp" },
      }, // Should be ignored
      state: {} as State,
      next: () => {
        ctx.state.session.foo = "bar";
        return Promise.resolve(new Response("OK"));
      },
    } as unknown as Context<State>;

    const res = await middleware(ctx);
    const cookies = getSetCookies(res.headers);
    const savedId = cookies.find((c) => c.name === "sessionId")!.value;

    expect(savedId).toBeDefined();

    // Verify internally
    const stored = await store.get(savedId) as StoredSession;
    expect(stored.ip).toEqual("203.0.113.195");
    // Should NOT match the remoteAddr
    expect(stored.ip).not.toEqual("1.2.3.4");
  });
});
