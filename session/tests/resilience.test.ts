import { expect } from "./deps.ts";
import { collection, kvdex } from "@olli/kvdex";
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
      expect(typeof retrieved?.lastSeenAt).toBe("number");
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
    } as any);

    // Getting the session should return undefined because the validator crashed
    const retrieved = await storeWithExplosion.get(sessionId);
    expect(retrieved).toBeUndefined();
  });

  kv.close();
});
