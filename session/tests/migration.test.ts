import { expect } from "./deps.ts";
import { CURRENT_SESSION_FORMAT_VERSION, migrate } from "../src/migrations.ts";

Deno.test("Session Migration Logic", async (t) => {
  await t.step(
    "should return fresh v1 record if __v is missing (no legacy support)",
    () => {
      const legacy = { theme: "dark", count: 42 };
      const migrated = migrate(legacy);

      expect(migrated.__v).toBe(1);
      expect(migrated.data).toEqual({}); // Data is NOT migrated
      expect(migrated.flash).toEqual({});
      expect(typeof migrated.createdAt).toBe("number");
    },
  );

  await t.step(
    "should return fresh v1 record for structured v0 records",
    () => {
      const legacy = {
        data: { theme: "light" },
        flash: { msg: "hello" },
        userId: "user-123",
      };
      const migrated = migrate(legacy);

      expect(migrated.__v).toBe(1);
      expect(migrated.data).toEqual({});
      expect(migrated.userId).toBeUndefined();
    },
  );

  await t.step(
    "should handle null/undefined by returning fresh v1 record",
    () => {
      const migrated = migrate(null);
      expect(migrated.__v).toBe(CURRENT_SESSION_FORMAT_VERSION);
      expect(migrated.data).toEqual({});
    },
  );

  await t.step("should preserve existing v1 records", () => {
    const v1 = {
      __v: 1,
      data: { foo: "bar" },
      flash: {},
      createdAt: 12345,
      lastSeenAt: 67890,
    };
    const migrated = migrate(v1);
    expect(migrated).toEqual(v1);
  });

  await t.step("should throw on unknown future versions", () => {
    const future = { __v: 99, data: {} };
    expect(() => migrate(future)).toThrow();
  });
});
