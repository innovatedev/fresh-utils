import { expect, fc } from "./deps.ts";
import { MemorySessionStorage } from "../src/stores/memory.ts";
import {
  type Context,
  createSessionMiddleware,
  type State,
} from "../src/session.ts";

Deno.test("Property-Based: Data Roundtrip", async () => {
  const store = new MemorySessionStorage();
  const middleware = createSessionMiddleware({ store });

  await fc.assert(
    fc.asyncProperty(fc.object(), async (obj: Record<string, unknown>) => {
      // 1. Save data
      const ctx1 = {
        req: new Request("http://localhost/"),
        state: {} as State,
        next: () => {
          // deno-lint-ignore no-explicit-any
          (ctx1.state.session as any).payload = obj;
          return Promise.resolve(new Response("OK"));
        },
      } as unknown as Context<State>;

      const res1 = await middleware(ctx1);
      const cookie = res1.headers.get("set-cookie");
      if (!cookie) return false;
      const sessionId = cookie.split(";")[0].split("=")[1];

      // 2. Load data
      const ctx2 = {
        req: new Request("http://localhost/", {
          headers: { Cookie: `sessionId=${sessionId}` },
        }),
        state: {} as State,
        next: () => {
          return Promise.resolve(new Response("OK"));
        },
      } as unknown as Context<State>;

      await middleware(ctx2);

      // We use JSON stringify comparison because some objects might have subtle differences
      // but session data is essentially JSON.
      // deno-lint-ignore no-explicit-any
      const retrieved = (ctx2.state.session as any).payload;
      return JSON.stringify(retrieved) === JSON.stringify(obj);
    }),
    { numRuns: 100 },
  );
});

Deno.test("Property-Based: Concurrent Updates Integrity", async () => {
  const store = new MemorySessionStorage();
  const middleware = createSessionMiddleware({ store });
  const sessionId = "concurrent-pbt";

  // Pre-seed
  await store.set(sessionId, {
    __v: 1,
    data: { count: 0 },
    flash: {},
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });

  // Run 50 concurrent updates
  const updates = Array.from({ length: 50 }, () => {
    const ctx = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${sessionId}` },
      }),
      state: {} as State,
      next: () => {
        // deno-lint-ignore no-explicit-any
        const session = ctx.state.session as any;
        session.count = (session.count || 0) + 1;
        return Promise.resolve(new Response("OK"));
      },
    } as unknown as Context<State>;
    return middleware(ctx);
  });

  // Silence the expected warnings for concurrency failures
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    await Promise.all(updates);
  } finally {
    console.warn = originalWarn;
  }

  const final = await store.get(sessionId);
  // With Optimistic Concurrency Control, we expect some updates to fail (warn).
  // But we MUST NOT have a value greater than the number of successful updates.
  // And the version must accurately reflect the number of successful writes.
  const version = parseInt(final?.version || "1");
  const count = final?.data?.count as number;

  // version 1 -> 2 -> 3 ...
  // Each successful write increments version by 1.
  // Initial version was 1.
  // So version - 1 = number of successful writes.
  expect(count).toEqual(version - 1);
  // We expect exactly 1 if they all hit at once, or more if they were sequential.
  // But they should ALWAYS match.
  expect(count).toBeGreaterThanOrEqual(1);
  expect(count).toBeLessThanOrEqual(50);
});
