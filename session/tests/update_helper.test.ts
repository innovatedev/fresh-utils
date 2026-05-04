import { expect } from "./deps.ts";
import { collection, kvdex, model } from "@olli/kvdex";
import { createSessionMiddleware } from "../src/session.ts";
import { KvDexSessionStorage } from "../src/stores/kvdex.ts";
import { SessionConflictError } from "../src/errors.ts";

Deno.test("Session.update() Helper", async (t) => {
  const kv = await Deno.openKv(":memory:");
  const db = kvdex({
    kv,
    schema: {
      sessions: collection(model<any>()),
    },
  });

  const store = new KvDexSessionStorage({
    db,
    collection: db.sessions,
  });

  const middleware = createSessionMiddleware({ store });

  const sessionId = "update-test-session";

  // Pre-seed the session
  await store.set(sessionId, {
    __v: 1,
    data: { count: 10 },
    flash: {},
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });

  await t.step("should perform atomic update with retries", async () => {
    const ctx: any = {
      req: { headers: new Headers({ cookie: `sessionId=${sessionId}` }) },
      info: { remoteAddr: { hostname: "127.0.0.1" } },
      state: {},
      next: async () => {
        // Use the new update helper
        const result = await ctx.state.session.update((data: any) => {
          return { ...data, count: data.count + 5 };
        });
        expect(result.ok).toBe(true);
        expect(result.data.count).toBe(15);
        return new Response("OK");
      },
    };

    await middleware(ctx);

    // Verify in store
    const final = await store.get(sessionId);
    expect((final?.data as any).count).toBe(15);
  });

  await t.step("should handle conflict and retry successfully", async () => {
    let callCount = 0;
    const ctx: any = {
      req: { headers: new Headers({ cookie: `sessionId=${sessionId}` }) },
      info: { remoteAddr: { hostname: "127.0.0.1" } },
      state: {},
      next: async () => {
        const result = await ctx.state.session.update(async (data: any) => {
          callCount++;
          if (callCount === 1) {
            // Simulate a concurrent write happening RIGHT NOW
            await store.set(sessionId, {
              __v: 1,
              data: { count: 100 },
              flash: {},
              createdAt: Date.now(),
              lastSeenAt: Date.now(),
            });
          }
          return { ...data, count: data.count + 1 };
        });

        expect(result.ok).toBe(true);
        expect(callCount).toBe(2); // Should have retried once
        expect(result.data.count).toBe(101); // 100 + 1
        return new Response("OK");
      },
    };

    const originalWarn = console.warn;
    console.warn = () => {};

    await middleware(ctx);

    console.warn = originalWarn;

    const final = await store.get(sessionId);
    expect((final?.data as any).count).toBe(101);
  });

  await t.step("should return exhausted if maxRetries exceeded", async () => {
    const ctx: any = {
      req: { headers: new Headers({ cookie: `sessionId=${sessionId}` }) },
      info: { remoteAddr: { hostname: "127.0.0.1" } },
      state: {},
      next: async () => {
        const result = await ctx.state.session.update((data: any) => {
          // Always cause a conflict by updating the store manually
          // (This is a bit tricky to simulate perfectly without mocking store.set to always fail)
          return data;
        }, { maxRetries: 1 });

        // We'll mock store.set for this specific test
        const originalSet = store.set.bind(store);
        store.set = () => {
          throw new SessionConflictError();
        };

        const failResult = await ctx.state.session.update((d: any) => d, {
          maxRetries: 1,
        });
        expect(failResult.ok).toBe(false);
        expect(failResult.reason).toBe("exhausted");

        store.set = originalSet;
        return new Response("OK");
      },
    };

    const originalError = console.error;
    console.error = () => {};

    await middleware(ctx);

    console.error = originalError;
  });

  kv.close();
});
