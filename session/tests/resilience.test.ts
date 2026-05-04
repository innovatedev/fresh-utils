import { expect } from "./deps.ts";
import { collection, kvdex } from "@olli/kvdex";
import { createSessionMiddleware } from "../src/session.ts";
import { KvDexSessionStorage, sessionModel } from "../src/stores/kvdex.ts";

Deno.test("Resilience & Edge Cases", async (t) => {
  const kv = await Deno.openKv(":memory:");

  // Setup standard store
  // deno-lint-ignore no-explicit-any
  const MySessionModel = sessionModel<any>();
  const db = kvdex({
    kv,
    schema: {
      sessions: collection(MySessionModel),
    },
  });

  const store = new KvDexSessionStorage({
    db: db,
    collection: db.sessions,
  });

  await t.step(
    "Migration: Handle corrupted or old-format data gracefully",
    async () => {
      const sessionId = "corrupted-session";

      // Manually insert "garbage" or old format into KV at the expected kvdex path
      // kvdex uses ["__kvdex__", collection_name, "__id__", id]
      await kv.set(["__kvdex__", "sessions", "__id__", sessionId], {
        something: "totally different",
        that: "is not a SessionDoc",
      });

      // Attempting to get this should ideally return an object with default metadata
      // thanks to our new guard rails, preventing a crash.
      const retrieved = await store.get(sessionId);
      expect(retrieved).toBeDefined();
      // deno-lint-ignore no-explicit-any
      expect(typeof (retrieved as any)?.lastSeenAt).toBe("number");
    },
  );

  await t.step(
    "Limits: Handle oversized session data (Deno KV 64KB limit)",
    async () => {
      const sessionId = "large-session";
      // Create data roughly ~100KB
      const largeData = "x".repeat(100 * 1024);

      const payload = {
        data: { content: largeData },
        flash: {},
        lastSeenAt: Date.now(),
      };

      // This SHOULD throw the Deno KV error (value too large)
      try {
        // deno-lint-ignore no-explicit-any
        await store.set(sessionId, payload as any);
        throw new Error("Should have thrown due to size limit");
      } catch (err) {
        const error = err as Error;
        expect(error.message).toContain("too large");
      }
    },
  );

  await t.step("Validator: Handle throwing validators", async () => {
    const throwingValidator = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: () => {
          throw new Error("Validator Exploded");
        },
      },
    };

    const storeWithExplosion = new KvDexSessionStorage({
      db: db,
      collection: db.sessions,
      // deno-lint-ignore no-explicit-any
      dataValidator: throwingValidator as any,
    });

    const sessionId = "test-session";
    // Use kvdex to set valid data first
    await db.sessions.set(sessionId, {
      data: { some: "data" },
      flash: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt: new Date(),
      // deno-lint-ignore no-explicit-any
    } as any);

    // Getting the session should THROW because the validator crashed
    let threw = false;
    try {
      await storeWithExplosion.get(sessionId);
    } catch (e) {
      threw = true;
      expect((e as Error).message).toBe("Validator Exploded");
    }
    expect(threw).toBe(true);
  });

  await t.step("Middleware: Handle store.set failure gracefully", async () => {
    const sessionId = "set-fail-session";
    // deno-lint-ignore no-explicit-any
    const storage: any = {
      get: () => ({
        data: { count: 1 },
        flash: {},
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        version: "v1",
      }),
      set: () => {
        throw new Error("Store Write Failed");
      },
      delete: () => {},
    };

    const middleware = createSessionMiddleware({ store: storage });

    const errors: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => errors.push(msg);

    // deno-lint-ignore no-explicit-any
    const ctx: any = {
      req: { headers: new Headers({ cookie: `sessionId=${sessionId}` }) },
      info: { remoteAddr: { hostname: "127.0.0.1" } },
      state: {},
      next: () => {
        ctx.state.session.count = 2;
        return new Response("OK");
      },
    };

    const response = await middleware(ctx);

    console.warn = originalWarn;

    // Verify request completed successfully despite store failure
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toBe("OK");

    // Verify warning was logged
    expect(errors.some((e) => e.includes("Concurrent modification detected")))
      .toBe(true);
  });

  kv.close();
});
