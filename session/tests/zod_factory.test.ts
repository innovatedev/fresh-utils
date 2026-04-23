import { expect } from "./deps.ts";
import { z } from "npm:zod@^3.24.0";
import { createBaseSessionSchema } from "../src/stores/kvdex.ts";

Deno.test("createBaseSessionSchema Factory", async (t) => {
  const schema = createBaseSessionSchema(z);

  await t.step("validates a standard session document", () => {
    const validDoc = {
      userId: "user123",
      flash: { message: "hello" },
      lastSeenAt: Date.now(),
      ua: "Mozilla/5.0",
      ip: "127.0.0.1",
    };

    const result = schema.safeParse(validDoc);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userId).toBe("user123");
    }
  });

  await t.step("allows custom data via passthrough", () => {
    const docWithExtra = {
      lastSeenAt: Date.now(),
      theme: "dark", // Extra field
    };

    const result = schema.safeParse(docWithExtra);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.theme).toBe("dark");
    }
  });

  await t.step("fails if required fields are missing", () => {
    const invalidDoc = {
      userId: "user123",
      // missing lastSeenAt
    };

    const result = schema.safeParse(invalidDoc);
    expect(result.success).toBe(false);
  });

  await t.step("can be extended", () => {
    const ExtendedSchema = schema.extend({
      role: z.enum(["admin", "user"]),
    });

    const result = ExtendedSchema.safeParse({
      lastSeenAt: Date.now(),
      role: "admin",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("admin");
    }

    const invalidResult = ExtendedSchema.safeParse({
      lastSeenAt: Date.now(),
      role: "guest",
    });
    expect(invalidResult.success).toBe(false);
  });
});
