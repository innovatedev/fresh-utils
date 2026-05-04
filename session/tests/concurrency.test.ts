import { expect } from "./deps.ts";
import { collection, kvdex } from "@olli/kvdex";
import { createSessionMiddleware } from "../src/session.ts";
import { KvDexSessionStorage, sessionModel } from "../src/stores/kvdex.ts";

Deno.test("Session Concurrency - Optimistic Locking Conflict Detection", async (t) => {
  const kv = await Deno.openKv(":memory:");
  const MySessionModel = sessionModel<any>();
  const db = kvdex({
    kv,
    schema: {
      sessions: collection(MySessionModel),
    },
  });

  const store = new KvDexSessionStorage({
    collection: db.sessions,
    db: db, // Pass db for atomic support
  });

  const middleware = createSessionMiddleware({ store });

  const sessionId = "concurrency-test";

  // Initial setup
  await store.set(sessionId, {
    __v: 1,
    data: { count: 0 },
    flash: {},
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });

  await t.step(
    "should detect conflict when two requests update the same session",
    async () => {
      // 1. First "Request" context
      const ctx1: any = {
        req: { headers: new Headers({ cookie: `sessionId=${sessionId}` }) },
        info: { remoteAddr: { hostname: "127.0.0.1" } },
        state: {},
        next: async () => {
          ctx1.state.session.count = 1;
          return new Response("OK");
        },
      };

      // 2. Second "Request" context
      const ctx2: any = {
        req: { headers: new Headers({ cookie: `sessionId=${sessionId}` }) },
        info: { remoteAddr: { hostname: "127.0.0.1" } },
        state: {},
        next: async () => {
          ctx2.state.session.count = 2;
          return new Response("OK");
        },
      };

      // 3. Execution (Simulate overlap)
      // We need to execute the middleware but intercept the 'next' call or wait.
      // Actually, createSessionMiddleware is async.

      // Both middlewares will call store.get() and get the same version.

      // We'll run them sequentially but mock the 'get' to return the same version stamp
      // OR we can just run them and hope the memory KV is fast enough,
      // but better to be deterministic.

      // Let's manually get the version
      const initial = await db.sessions.find(sessionId);
      const version = initial?.versionstamp;

      // Run first update
      await middleware(ctx1);

      // Verify first update succeeded
      const after1 = await db.sessions.find(sessionId);
      expect((after1?.value as any).data.count).toBe(1);
      expect(after1?.versionstamp).not.toBe(version);

      // Run second update using the OLD versionstamp (simulating concurrent read)
      // We'll need to monkey-patch the store's get for ctx2 to return the old version
      const originalGet = store.get.bind(store);
      store.get = async (id: string) => {
        const res = await originalGet(id);
        return { ...res!, version: version! }; // Force old version
      };

      // We expect a console.warn
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => warnings.push(msg);

      await middleware(ctx2);

      console.warn = originalWarn;

      // Verify conflict was detected
      expect(warnings.some((w) => w.includes("Optimistic locking failure")))
        .toBe(true);

      // Verify data was NOT overwritten by ctx2 (it should still be 1)
      const final = await db.sessions.find(sessionId);
      expect((final?.value as any).data.count).toBe(1);
    },
  );

  kv.close();
});
