import { expect } from "./deps.ts";
import { collection, kvdex, model } from "@olli/kvdex";
import {
  KvDexSessionStorage,
  type KvValue,
  type SessionDoc,
} from "../src/stores/kvdex.ts";

Deno.test("Write-Ahead Log (WAL) Crash Recovery", async (t) => {
  const kv = await Deno.openKv(":memory:");
  // Create a strongly typed model so that kvdex typing works
  type TestSession = { userId: string; foo: string; createdAt: Date };
  const TestModel = model<TestSession>();

  const db = kvdex({
    kv,
    schema: {
      sessions: collection(TestModel, {
        indices: {
          userId: "secondary",
        },
      }),
    },
  });

  const sessionId = "wal-test-session";
  const walPrefix = [
    "__@innovatedev__",
    "fresh-session",
    "kvdex",
    "write-ahead-logging",
  ];

  await t.step("should recover orphaned WAL records on startup", async () => {
    // 1. Simulate a crashed state: A primary document was written, and a WAL record exists,
    // but the secondary index (kvdex internal structure) was never updated.

    const oldDoc: SessionDoc<KvValue> = {
      __v: 1,
      data: { foo: "bar" },
      flash: {},
      createdAt: new Date(),
      lastSeenAt: new Date(),
      userId: "old-user-id", // Old index value
    } as unknown as SessionDoc<KvValue>;

    const newDoc = {
      ...oldDoc,
      userId: "new-user-id", // New index value we want to sync
    };

    // Insert the primary document (bypassing kvdex builder limits just like set() does)
    // deno-lint-ignore no-explicit-any
    const idKey = [...(db.sessions as any).keys.id, sessionId];
    await kv.set(idKey, newDoc);

    // Insert the WAL record that indicates the index update is pending
    await kv.set([...walPrefix, sessionId], {
      oldDoc,
      newDoc,
    });

    // 2. Instantiate the store, which fires the background #syncWal task in the constructor
    new KvDexSessionStorage({
      db: db,
      collection: db.sessions,
    });

    // Wait a brief moment for the background microtask to complete
    await new Promise((r) => setTimeout(r, 100));

    // 3. Verify the WAL record was deleted
    const walEntry = await kv.get([...walPrefix, sessionId]);
    expect(walEntry.value).toBeNull();

    // 4. Verify the old secondary index was deleted
    // deno-lint-ignore no-explicit-any
    const oldIndexSearch = await (db.sessions as any).findBySecondaryIndex(
      "userId",
      "old-user-id",
    );
    expect(oldIndexSearch.result.length).toBe(0);

    // 5. Verify the new secondary index was successfully created
    // deno-lint-ignore no-explicit-any
    const newIndexSearch = await (db.sessions as any).findBySecondaryIndex(
      "userId",
      "new-user-id",
    );
    expect(newIndexSearch.result.length).toBe(1);
    expect((newIndexSearch.result[0].value as SessionDoc<KvValue>).userId).toBe(
      "new-user-id",
    );
  });

  await t.step(
    "should handle partial sync failures and preserve WAL",
    async () => {
      const sessionId = "partial-fail-session";
      const newDoc = {
        __v: 1,
        data: { foo: "partial" },
        flash: {},
        createdAt: new Date(),
        lastSeenAt: new Date(),
        userId: "fail-user-id",
      } as unknown as SessionDoc<KvValue>;

      // 1. Setup a WAL record
      await kv.set([...walPrefix, sessionId], {
        oldDoc: null,
        newDoc,
      });

      // 2. Mock kv.set to fail for index updates
      const originalSet = kv.set.bind(kv);
      kv.set = (key, value, options) => {
        if (
          Array.isArray(key) &&
          key.some((k) => typeof k === "string" && k.includes("index"))
        ) {
          throw new Error("KV Index Update Failure");
        }
        return originalSet(key, value, options);
      };

      // 3. Instantiate store (triggers sync)
      // Silence the expected background error
      const originalError = console.error;
      console.error = () => {};

      try {
        new KvDexSessionStorage({
          db,
          collection: db.sessions,
        });

        await new Promise((r) => setTimeout(r, 100));
      } finally {
        console.error = originalError;
      }

      // 4. WAL record should STILL exist because sync failed
      const walEntry = await kv.get([...walPrefix, sessionId]);
      expect(walEntry.value).not.toBeNull();

      // Restore original set
      kv.set = originalSet;
    },
  );

  kv.close();
});
