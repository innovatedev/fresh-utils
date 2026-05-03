import { expect } from "./deps.ts";
import { collection, kvdex } from "@olli/kvdex";
import { KvDexSessionStorage, sessionModel } from "../src/stores/kvdex.ts";
// deno-lint-ignore no-import-prefix
import { type } from "npm:arktype@^2.2.0";
// deno-lint-ignore no-import-prefix
import { z } from "npm:zod@^4.4.2";

Deno.test("Recommended Validation Patterns", async (t) => {
  const kv = await Deno.openKv(":memory:");

  await t.step("Arktype Pattern", async () => {
    // 1. Define your session data schema
    const dataSchema = type({
      theme: "'light' | 'dark'",
      count: "number",
    });

    // 2. Use sessionModel for the collection structure
    const MySessionModel = sessionModel(dataSchema);

    const db = kvdex({
      kv,
      schema: {
        sessions: collection(MySessionModel),
      },
    });

    // We use any for the store in tests to verify the wrapped structure easily
    // deno-lint-ignore no-explicit-any
    const store: any = new KvDexSessionStorage({
      collection: db.sessions,
    });

    const sessionId = "ark-test";

    // Valid data
    type MyData = typeof dataSchema.infer;
    const validData: MyData = { theme: "dark", count: 42 };
    const out = dataSchema(validData);
    if (out instanceof type.errors) throw out;

    // Simulate the middleware wrapping the data
    await store.set(sessionId, {
      data: out,
      flash: {},
      lastSeenAt: Date.now(),
    });

    const retrieved = await store.get(sessionId);
    // retrieved is a StoredSession, so we access .data
    expect(retrieved?.data?.theme).toBe("dark");

    // Invalid data check
    const invalidData = { theme: "blue", count: "invalid" };
    // deno-lint-ignore no-explicit-any
    const result = dataSchema(invalidData as any);
    expect(result instanceof type.errors).toBe(true);
  });

  await t.step("Zod Pattern", async () => {
    // 1. Define your session data schema
    const dataSchema = z.object({
      role: z.enum(["admin", "user"]),
      // deno-lint-ignore no-explicit-any
      settings: z.record(z.string(), z.any()),
    });

    // 2. Use sessionModel for the collection structure
    const MySessionModel = sessionModel(dataSchema);

    const db = kvdex({
      kv,
      schema: {
        zod_sessions: collection(MySessionModel),
      },
    });

    // deno-lint-ignore no-explicit-any
    const store: any = new KvDexSessionStorage({
      collection: db.zod_sessions,
    });

    const sessionId = "zod-test";

    // Valid data
    const validData = dataSchema.parse({
      role: "admin",
      settings: { foo: "bar" },
    });

    // Simulate middleware wrapping
    await store.set(sessionId, {
      data: validData,
      flash: {},
      lastSeenAt: Date.now(),
    });

    const retrieved = await store.get(sessionId);
    expect(retrieved?.data?.role).toBe("admin");

    // Invalid data
    const invalidResult = dataSchema.safeParse({ role: "guest" });
    expect(invalidResult.success).toBe(false);
  });

  kv.close();
});
