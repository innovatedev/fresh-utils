import { expect } from "./deps.ts";
import { MIDDLEWARE_SCHEMA_VERSION, migrate } from "../src/migrations.ts";

Deno.test("Session Migration Logic", async (t) => {
  await t.step(
    "should migrate v0 record (missing __v) and preserve data",
    () => {
      const legacy = { theme: "dark", count: 42 };
      const { record: migrated, migrated: isMigrated } = migrate(legacy);

      expect(isMigrated).toBe(true);
      expect(migrated.__v).toBe(1);
      expect(migrated.data).toBeUndefined(); // It's still at the root in raw legacy
      expect((migrated as unknown as Record<string, unknown>).theme).toBe(
        "dark",
      );
      expect((migrated as unknown as Record<string, unknown>).count).toBe(42);
      expect(migrated.flash).toEqual({});
      expect(typeof migrated.createdAt).toBe("number");
    },
  );

  await t.step(
    "should migrate structured v0 records",
    () => {
      const legacy = {
        data: { theme: "light" },
        flash: { msg: "hello" },
        userId: "user-123",
      };
      const { record: migrated } = migrate(legacy);

      expect(migrated.__v).toBe(1);
      expect(migrated.data).toEqual({ theme: "light" });
      expect(migrated.flash).toEqual({ msg: "hello" });
      expect(migrated.userId).toBe("user-123");
    },
  );

  await t.step(
    "should handle null/undefined by returning fresh record",
    () => {
      const { record: migrated } = migrate(null);
      expect(migrated.__v).toBe(MIDDLEWARE_SCHEMA_VERSION);
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
    const { record: migrated, migrated: isMigrated } = migrate(v1);
    expect(isMigrated).toBe(false);
    expect(migrated).toEqual(v1);
  });

  await t.step("should throw on unknown future versions", () => {
    const future = { __v: 99, data: {} };
    expect(() => migrate(future)).toThrow();
  });
});
