import { expect } from "./deps.ts";
import { getSetCookies } from "@std/http/cookie";
import {
  type Context,
  createSessionMiddleware,
  type SessionStorage,
  type State,
  type StoredSession,
} from "../src/session.ts";
import { MemorySessionStorage } from "../src/stores/memory.ts";

Deno.test("Security: 128-bit Entropy and Collision Resistance", async () => {
  const store = new MemorySessionStorage();
  const middleware = createSessionMiddleware({ store });
  const ids = new Set<string>();

  for (let i = 0; i < 100; i++) {
    const ctx = {
      req: new Request("http://localhost/"),
      state: {} as State,
      next: () => Promise.resolve(new Response("OK")),
    } as unknown as Context<State>;

    const res = await middleware(ctx);
    const cookies = getSetCookies(res.headers);
    const sessionId = cookies.find((c) => c.name === "sessionId")!.value;

    // 128 bits = 16 bytes = 32 hex characters
    expect(sessionId.length).toEqual(32);
    expect(/^[0-9a-f]{32}$/.test(sessionId)).toBe(true);

    expect(ids.has(sessionId)).toBe(false);
    ids.add(sessionId);
  }
});

Deno.test("Security: Server-side Expiry Enforcement", async (t) => {
  const store = new MemorySessionStorage();
  // Set a very short expiry for testing
  const expiry = 1; // 1 second
  const middleware = createSessionMiddleware({ store, expiry });

  let savedId: string;

  await t.step("Create session", async () => {
    const ctx = {
      req: new Request("http://localhost/"),
      state: {} as State,
      next: () => {
        ctx.state.session.foo = "bar";
        return Promise.resolve(new Response("OK"));
      },
    } as unknown as Context<State>;

    const res = await middleware(ctx);
    savedId = getSetCookies(res.headers).find((c) =>
      c.name === "sessionId"
    )!.value;
  });

  await t.step("Wait for expiry", async () => {
    await new Promise((r) => setTimeout(r, 1100));
  });

  await t.step("Verify invalidation", async () => {
    const ctx = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${savedId}` },
      }),
      state: {} as State,
      next: () => Promise.resolve(new Response("OK")),
    } as unknown as Context<State>;

    const res = await middleware(ctx);
    const newId = getSetCookies(res.headers).find((c) =>
      c.name === "sessionId"
    )!.value;

    // Should have rotated/invalidated
    expect(newId).not.toEqual(savedId);
    expect(ctx.state.session).toEqual({});
  });
});

Deno.test("Performance: Write-on-change", async (t) => {
  let setCalls = 0;
  const store: SessionStorage = {
    get: () => ({
      __v: 1,
      data: { foo: "bar" },
      flash: {},
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
    }),
    set: () => {
      setCalls++;
    },
    delete: () => {},
  };

  const middleware = createSessionMiddleware({ store });

  await t.step("No change = No write (within 1 minute)", async () => {
    const ctx = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=test` },
      }),
      state: {} as State,
      next: () => Promise.resolve(new Response("OK")),
    } as unknown as Context<State>;
    const res = await middleware(ctx);
    expect(setCalls).toEqual(0);

    // Negative assertion: No set-cookie header should be sent if session is stable
    const cookies = getSetCookies(res.headers);
    expect(cookies.find((c) => c.name === "sessionId")).toBeUndefined();
  });

  await t.step("Data change = Write", async () => {
    const ctx = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=test` },
      }),
      state: {} as State,
      next: () => {
        ctx.state.session.foo = "changed";
        return Promise.resolve(new Response("OK"));
      },
    } as unknown as Context<State>;
    await middleware(ctx);
    expect(setCalls).toEqual(1);
  });
});

Deno.test("Security: Absolute Expiry Enforcement", async (t) => {
  const store = new MemorySessionStorage();
  const absoluteExpiry = 1; // 1 second
  // No idle expiry, only absolute
  const middleware = createSessionMiddleware({ store, absoluteExpiry });

  let savedId: string;

  await t.step("Create session", async () => {
    const ctx = {
      req: new Request("http://localhost/"),
      state: {} as State,
      next: () => {
        ctx.state.session.foo = "bar";
        return Promise.resolve(new Response("OK"));
      },
    } as unknown as Context<State>;
    const res = await middleware(ctx);
    savedId = getSetCookies(res.headers).find((c) =>
      c.name === "sessionId"
    )!.value;
  });

  await t.step("Keep active (within absolute limit)", async () => {
    const ctx = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${savedId}` },
      }),
      state: {} as State,
      next: () => {
        // deno-lint-ignore no-explicit-any
        (ctx.state.session as any).touched = true; // Trigger write to see cookie
        return Promise.resolve(new Response("OK"));
      },
    } as unknown as Context<State>;
    const res = await middleware(ctx);
    const id = getSetCookies(res.headers).find((c) =>
      c.name === "sessionId"
    )!.value;
    expect(id).toEqual(savedId);
  });

  await t.step("Wait for absolute expiry", async () => {
    await new Promise((r) => setTimeout(r, 1100));
  });

  await t.step("Verify invalidation (even if recently seen)", async () => {
    const ctx = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${savedId}` },
      }),
      state: {} as State,
      next: () => Promise.resolve(new Response("OK")),
    } as unknown as Context<State>;

    const res = await middleware(ctx);
    const newId = getSetCookies(res.headers).find((c) =>
      c.name === "sessionId"
    )!.value;

    expect(newId).not.toEqual(savedId);
    expect(ctx.state.session).toEqual({});
  });
});

Deno.test("Correctness: Rotation Safety", async () => {
  let deleteCalled = false;
  let setCalled = false;
  let savedId: string | undefined;

  const store: SessionStorage = {
    get: (_id: string) => ({
      __v: 1,
      data: { user: "test" },
      flash: {},
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
    }),
    set: (id: string, _data: unknown) => {
      setCalled = true;
      savedId = id;
    },
    delete: (_id: string) => {
      deleteCalled = true;
    },
  };

  const middleware = createSessionMiddleware({ store });

  const ctx = {
    req: new Request("http://localhost/", {
      headers: { Cookie: `sessionId=old-id` },
    }),
    state: {} as State,
    next: async () => {
      // Manually trigger rotation without changing data
      await ctx.state.login("new-user", { user: "test" });
      return new Response("OK");
    },
  } as unknown as Context<State>;

  await middleware(ctx);

  expect(deleteCalled).toBe(true);
  expect(setCalled).toBe(true);
  expect(savedId).not.toEqual("old-id");
  expect(savedId).toBeDefined();
});

Deno.test("Correctness: Optimistic Locking Collision", async (t) => {
  const store = new MemorySessionStorage();
  const middleware = createSessionMiddleware({ store });

  const sessionId = "test-collision";
  // Pre-seed the session
  store.set(sessionId, {
    __v: 1,
    data: { counter: 0 },
    flash: {},
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });

  await t.step("Concurrent Reads and Conflicting Writes", async () => {
    // Simulate Request A
    const ctxA = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${sessionId}` },
      }),
      state: {} as State,
      next: () => {
        ctxA.state.session.counter = 1;
        return Promise.resolve(new Response("OK"));
      },
    } as unknown as Context<State>;

    // Simulate Request B (started after A reads, but before A saves)
    const ctxB = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${sessionId}` },
      }),
      state: {} as State,
      next: () => {
        ctxB.state.session.counter = 2;
        return Promise.resolve(new Response("OK"));
      },
    } as unknown as Context<State>;

    // We expect a console.warn during collision
    const originalWarn = console.warn;
    console.warn = () => {};

    // Run both concurrently
    // Note: Since they are async, they will both perform store.get()
    // before either performs store.set()
    const [_resA, _resB] = await Promise.all([
      middleware(ctxA),
      middleware(ctxB),
    ]);

    console.warn = originalWarn;

    const finalData = store.get(sessionId);
    const counter = (finalData as StoredSession)?.data?.counter;

    // One must have won, and the other must have failed.
    // The final value should be EITHER 1 or 2, depending on which saved first.
    // Without optimistic locking, the last one would always win, but with
    // concurrency they would both succeed and we'd just see the last one.
    // Here, we want to ensure that they don't both succeed silently if we had a way to track it,
    // but for now, verifying it's one of the expected values is a start.
    // Actually, the best way to verify OCC is to check the version.
    // Initial version was 1. One successful update makes it 2.
    // If they both succeeded, it would be 3.
    expect(finalData?.version).toEqual("2");
    expect([1, 2]).toContain(counter);
  });
});
